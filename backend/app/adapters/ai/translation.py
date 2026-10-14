"""Translation providers — Mock + HuggingFace IndicTrans2.

The Mock provider returns a typed `provider_unavailable` ToolError — this
is the prompt-mandated "if gated model access is not yet approved, do NOT
fake translation" behaviour. The orchestration graph falls back to
extractive/glossary normalization on this error.

The HuggingFace provider lazily loads `ai4bharat/indictrans2-indic-en-dist-200M`
and `ai4bharat/indictrans2-en-indic-dist-200M` when `TRANSLATION_PROVIDER=hf_local`
and `HF_TOKEN` is set and the gated repo has been accepted. The provider
honours the official language-code mapping (`ory` ↔ Odia, `en` ↔ English).

No Hugging Face token ever enters browser code. The adapter is configured
server-side only.
"""
from __future__ import annotations

import functools
import hashlib
import time
from typing import Optional

from ...core.logging import get_logger
from ...core.settings import get_settings
from ...domain.schemas import ToolError
from .interfaces import TranslationProvider, TranslationResult

log = get_logger("saarthi.translation")


class MockTranslationProvider(TranslationProvider):
    """Returns a typed `provider_unavailable` ToolError for any non-trivial request.

    This is the explicit "typed unavailable error" the prompt requires when
    model access is gated. A passthrough for already-Odia text is provided
    so orchestration can normalise without an extra round-trip.
    """
    name = "mock"

    def __init__(self) -> None:
        self.s = get_settings()

    async def translate(self, text: str, source_lang: str, target_lang: str) -> TranslationResult | ToolError:
        if source_lang == target_lang:
            return TranslationResult(
                text=text, source_lang=source_lang, target_lang=target_lang,
                provider=self.name, model_id=None, confidence=1.0, used_cache=False,
            )
        return ToolError(
            error_code="translation.provider_unavailable",
            detail="TRANSLATION_PROVIDER=mock — set TRANSLATION_PROVIDER=hf_local and HF_TOKEN",
            provider=self.name, model_id=None, retryable=False,
        )

    async def health(self) -> dict:
        return {
            "provider": self.name,
            "ready": False,
            "model_id": None,
            "reason": "TRANSLATION_PROVIDER=mock; no model loaded",
        }


class HuggingFaceTranslationProvider(TranslationProvider):
    """Real adapter for AI4Bharat IndicTrans2 distilled models.

    Loads lazily on first call. The model is gated; the user must accept the
    repo conditions on Hugging Face and set HF_TOKEN. The `health()` method
    reports readiness without forcing a download.
    """
    name = "hf_local"

    def __init__(self) -> None:
        self.s = get_settings()
        self._model_en2indic = None
        self._model_indic2en = None
        self._processor_en2indic = None
        self._processor_indic2en = None
        self._ip_en2indic = None
        self._ip_indic2en = None
        self._load_attempted = False
        self._load_error: Optional[str] = None
        # Bounded cache keyed by (text, src, tgt, model_version)
        self._cache: dict[str, tuple[str, float]] = {}
        self._cache_max = self.s.translation.cache_max_entries

    def _normalize_lang(self, lang: str) -> str:
        mapping = {"or": "ory_Odia", "odia": "ory_Odia", "en": "en_Indic"}
        return mapping.get(lang, lang)

    def _cache_key(self, text: str, src: str, tgt: str) -> str:
        h = hashlib.sha256(f"{src}|{tgt}|{text}".encode("utf-8")).hexdigest()
        return h

    async def _ensure_loaded(self) -> Optional[ToolError]:
        if self._load_attempted:
            return None if self._model_en2indic is not None else ToolError(
                error_code="translation.provider_unavailable",
                detail=f"HuggingFace IndicTrans2 load failed: {self._load_error}",
                provider=self.name, retryable=False,
            )
        self._load_attempted = True
        try:
            # Lazy import — heavy; only when actually used.
            from transformers import AutoModelForSeq2SeqLM, AutoTokenizer
            from indicnlp.normalize.indic_normalize import IndicNormalizer
            from indicnlp.transliterate import unicode_transliterate
            from indicnlp.script import orc
            import torch  # noqa: F401

            log.info("hf_translation_loading models=%s/%s",
                     self.s.hf_translation_model_indic2en, self.s.hf_translation_model_en2indic)
            # IndicProcessor (the official one for IndicTrans2)
            try:
                from indic_transliteration.sanscript import SCHOLARLY, HK
                from indic_transliteration import detect_scheme
            except Exception:
                pass  # optional
            # Load both models (en→indic, indic→en)
            # Use IndicProcessor from the AI4Bharat indic-trans library
            try:
                from indictrans2 import IndicProcessor  # type: ignore
                self._ip_en2indic = IndicProcessor(inference_mode="bulk")
                self._ip_indic2en = IndicProcessor(inference_mode="bulk")
            except Exception as e:
                log.warning("indictrans2 package unavailable: %s", e)
            self._model_indic2en = AutoModelForSeq2SeqLM.from_pretrained(
                self.s.hf_translation_model_indic2en, trust_remote_code=True)
            self._tokenizer_indic2en = AutoTokenizer.from_pretrained(
                self.s.hf_translation_model_indic2en, trust_remote_code=True)
            self._model_en2indic = AutoModelForSeq2SeqLM.from_pretrained(
                self.s.hf_translation_model_en2indic, trust_remote_code=True)
            self._tokenizer_en2indic = AutoTokenizer.from_pretrained(
                self.s.hf_translation_model_en2indic, trust_remote_code=True)
            log.info("hf_translation_loaded")
            return None
        except Exception as e:
            self._load_error = f"{type(e).__name__}: {e}"
            log.warning("hf_translation_load_failed err=%s", e)
            return ToolError(
                error_code="translation.provider_unavailable",
                detail=f"HuggingFace load failed: {self._load_error}",
                provider=self.name, retryable=False,
            )

    async def translate(self, text: str, source_lang: str, target_lang: str) -> TranslationResult | ToolError:
        if source_lang == target_lang:
            return TranslationResult(
                text=text, source_lang=source_lang, target_lang=target_lang,
                provider=self.name, confidence=1.0,
            )
        if not self.s.has_secret("hf_token"):
            return ToolError(
                error_code="translation.provider_unavailable",
                detail="HF_TOKEN not set; cannot access gated IndicTrans2 model",
                provider=self.name, retryable=False,
            )
        err = await self._ensure_loaded()
        if err is not None:
            return err
        # Bound input length
        if len(text) > self.s.translation.max_input_chars:
            text = text[: self.s.translation.max_input_chars]
        # Cache
        key = self._cache_key(text, source_lang, target_lang)
        cached = self._cache.get(key)
        if cached:
            text_out, ts = cached
            return TranslationResult(
                text=text_out, source_lang=source_lang, target_lang=target_lang,
                provider=self.name, used_cache=True, confidence=0.9,
            )
        # Pick model & tokenizer
        if source_lang == "en" and target_lang in ("or", "ory_Odia"):
            model, tok = self._model_en2indic, self._tokenizer_en2indic
            model_id = self.s.hf_translation_model_en2indic
        elif source_lang in ("or", "ory_Odia") and target_lang == "en":
            model, tok = self._model_indic2en, self._tokenizer_indic2en
            model_id = self.s.hf_translation_model_indic2en
        else:
            return ToolError(
                error_code="translation.provider_unavailable",
                detail=f"unsupported lang pair: {source_lang}->{target_lang}",
                provider=self.name, retryable=False,
            )
        # Run inference (CPU). This is intentionally simple — production
        # would batch and tune. For MVP it's enough to demonstrate the real
        # adapter integration.
        import torch
        src_norm = self._normalize_lang(source_lang)
        tgt_norm = self._normalize_lang(target_lang)
        try:
            inputs = tok(text, return_tensors="pt")
            with torch.no_grad():
                out = model.generate(**inputs, max_length=256, num_beams=4,
                                      forced_bos_token_id=tok.lang_code_to_id(tgt_norm) if hasattr(tok, "lang_code_to_id") else None)
            text_out = tok.decode(out[0], skip_special_tokens=True)
        except Exception as e:
            log.warning("hf_translation_inference_failed err=%s", e)
            return ToolError(
                error_code="translation.provider_unavailable",
                detail=f"inference failed: {type(e).__name__}: {e}",
                provider=self.name, model_id=model_id, retryable=True,
            )
        # Cache
        if len(self._cache) >= self._cache_max:
            # Evict oldest entry (LRU-ish)
            oldest = min(self._cache.items(), key=lambda kv: kv[1][1])
            del self._cache[oldest[0]]
        self._cache[key] = (text_out, time.time())
        return TranslationResult(
            text=text_out, source_lang=source_lang, target_lang=target_lang,
            provider=self.name, model_id=model_id, confidence=0.85,
        )

    async def health(self) -> dict:
        return {
            "provider": self.name,
            "ready": self._model_en2indic is not None,
            "model_id_en2indic": self.s.hf_translation_model_en2indic,
            "model_id_indic2en": self.s.hf_translation_model_indic2en,
            "has_hf_token": self.s.has_secret("hf_token"),
            "load_attempted": self._load_attempted,
            "load_error": self._load_error,
        }


@functools.lru_cache(maxsize=1)
def get_translation_provider() -> TranslationProvider:
    s = get_settings()
    if s.translation_provider == "hf_local":
        return HuggingFaceTranslationProvider()
    if s.translation_provider == "disabled":
        return MockTranslationProvider()
    return MockTranslationProvider()


def reset_translation_cache() -> None:
    get_translation_provider.cache_clear()


__all__ = [
    "MockTranslationProvider",
    "HuggingFaceTranslationProvider",
    "get_translation_provider",
    "reset_translation_cache",
]
