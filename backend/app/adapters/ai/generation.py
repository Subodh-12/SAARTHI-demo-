"""Generation providers — Mock (extractive) + OpenAI-compatible (gated).

Mock provider returns the top retrieved chunk as the answer with full
citation — this is the design doc's "extractive answer with clear
basic-answer status" fallback, NOT a fabricated LLM output. Marked
`provenance=extractive`.

OpenAI provider calls a configurable chat completion endpoint when
`LLM_API_KEY` is set, with grounded system prompt and citation enforcement.
"""
from __future__ import annotations

import time
from typing import Optional

from ...core.logging import get_logger
from ...core.settings import get_settings
from ...domain.schemas import RetrievedChunk, ToolError
from .interfaces import GenerationProvider, GenerationRequest

log = get_logger("saarthi.generation")


class MockGenerationProvider(GenerationProvider):
    """Extractive fallback — returns the top retrieved chunk verbatim.

    NOT a fake LLM. Marked `provenance=extractive` so the UI can label it.
    """
    name = "mock"

    async def generate(self, req: GenerationRequest) -> tuple[str, list[str], Optional[ToolError]]:
        if not req.retrieved_chunks:
            return "", [], ToolError(
                error_code="generation.no_context",
                detail="No retrieved chunks to ground answer in",
                provider=self.name, retryable=False,
            )
        top = req.retrieved_chunks[0]
        # Build a short extractive answer: first 600 chars of top chunk + citation.
        text = top.text_or[:600]
        if len(top.text_or) > 600:
            # cut at last sentence boundary if possible
            cut = text.rfind("।")
            if cut > 200:
                text = text[: cut + 1]
            else:
                text = text[:600] + "…"
        return text, [top.chunk_id], None


class OpenAIGenerationProvider(GenerationProvider):
    """Cloud LLM via OpenAI-compatible chat completion API.

    Requires `LLM_API_KEY`. Sends the retrieved chunks as clearly-delimited
    context, asks for an Odia grounded answer with explicit citations.
    Validates that returned citations correspond to provided chunks (in
    `domain/validators.py`).
    """
    name = "openai"

    def __init__(self) -> None:
        self.s = get_settings()

    async def generate(self, req: GenerationRequest) -> tuple[str, list[str], Optional[ToolError]]:
        if not self.s.has_secret("llm_api_key"):
            return "", [], ToolError(
                error_code="generation.provider_unavailable",
                detail="LLM_API_KEY not set",
                provider=self.name, retryable=False,
            )
        # Build the grounded prompt
        context_str = "\n\n".join(
            f"[CHUNK {i+1}] chunk_id={c.chunk_id} source_ref={c.source_ref}\n{c.text_or}"
            for i, c in enumerate(req.retrieved_chunks)
        )
        system = req.system_prompt or (
            "You are SAARTHI, an Odia-language science tutor for Class 9 students. "
            "Answer ONLY using the provided chunks. Cite the chunk_id in [CHUNK N] format. "
            "If the answer is not in the chunks, say: 'ଏହି ପ୍ରଶ୍ନ ଆମ ପାଠ୍ୟକ୍ରମ ବାହାରେ।' "
            "Never use outside knowledge. Use Odia script (Unicode). Max 200 words."
        )
        user_msg = (
            f"Question: {req.query}\n\n"
            f"Retrieved curriculum chunks (these are the only source of truth):\n"
            f"{context_str}\n\n"
            f"Answer in Odia, grounded in the chunks, with citations [CHUNK N]."
        )
        # Use httpx for the API call (sync->async)
        import httpx
        headers = {
            "Authorization": f"Bearer {self.s.llm_api_key}",
            "Content-Type": "application/json",
        }
        body = {
            "model": self.s.llm_model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user_msg},
            ],
            "max_tokens": 600,
            "temperature": 0.2,
        }
        base_url = self.s.llm_base_url or "https://api.openai.com/v1"
        url = f"{base_url.rstrip('/')}/chat/completions"
        try:
            async with httpx.AsyncClient(timeout=self.s.llm_timeout_seconds) as client:
                resp = await client.post(url, json=body, headers=headers)
            if resp.status_code != 200:
                return "", [], ToolError(
                    error_code="generation.provider_unavailable",
                    detail=f"HTTP {resp.status_code}: {resp.text[:200]}",
                    provider=self.name, retryable=True,
                )
            data = resp.json()
            text = data["choices"][0]["message"]["content"].strip()
        except Exception as e:
            log.warning("llm_call_failed err=%s", e)
            return "", [], ToolError(
                error_code="generation.provider_unavailable",
                detail=f"{type(e).__name__}: {e}",
                provider=self.name, retryable=True,
            )
        # Extract citations like [CHUNK 1] → chunk_id
        # The validator will check these against req.retrieved_chunks.
        import re
        cited_indices = [int(m) - 1 for m in re.findall(r"\[CHUNK\s+(\d+)\]", text)]
        citation_ids = [
            req.retrieved_chunks[i].chunk_id
            for i in cited_indices
            if 0 <= i < len(req.retrieved_chunks)
        ]
        return text, citation_ids, None


import functools


@functools.lru_cache(maxsize=1)
def get_generation_provider() -> GenerationProvider:
    s = get_settings()
    if s.llm_provider == "openai":
        return OpenAIGenerationProvider()
    return MockGenerationProvider()


def reset_generation_cache() -> None:
    get_generation_provider.cache_clear()


__all__ = [
    "MockGenerationProvider", "OpenAIGenerationProvider",
    "get_generation_provider", "reset_generation_cache",
]
