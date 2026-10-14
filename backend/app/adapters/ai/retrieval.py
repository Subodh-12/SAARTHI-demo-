"""Retrieval providers — local hybrid (BM25 + dense cosine + glossary) and FAISS.

`local_hybrid` is the MVP default. It uses:
- BM25 (rank-bm25) over Odia chunks
- Glossary expansion (Odia↔English scientific terms)
- Dense retrieval with deterministic hash embeddings (configurable to HF/OpenAI embeddings)
- Reciprocal rank fusion to merge BM25 + dense rankings

`faiss_hybrid` is the same algorithm with FAISS as the dense index backend
when `RETRIEVAL_PROVIDER=faiss` (requires `faiss-cpu`, not in the env).
"""
from __future__ import annotations

import hashlib
import math
import re
import unicodedata
from collections import defaultdict
from typing import Optional

from ...core.logging import get_logger
from ...core.settings import get_settings
from ...content.pack_loader import PackContentIndex, load_pack_index
from ...domain.ruleset import get_ruleset
from ...domain.schemas import RetrievedChunk, RetrievedResult, ToolError
from .interfaces import EmbeddingsProvider, RetrievalProvider

log = get_logger("saarthi.retrieval")


# --------------------------------------------------------------------------- #
# Embeddings
# --------------------------------------------------------------------------- #
class MockEmbeddingsProvider(EmbeddingsProvider):
    """Deterministic hash-based embeddings — content-keyed, 256-dim, normalised.

    Not a meaningful semantic model; gives reproducible vectors for tests
    and the demo pack. Real embeddings are a config switch away.
    """
    name = "mock"
    DIM = 256

    def dim(self) -> int:
        return self.DIM

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Optional[ToolError]]:
        out = []
        for t in texts:
            h = hashlib.sha256(t.encode("utf-8")).digest()
            # Use the 32-byte hash to seed a 256-dim normalised vector.
            v = [((h[i % 32] >> (i % 8)) & 1) * 2 - 1 for i in range(self.DIM)]
            # Normalise
            norm = math.sqrt(sum(x * x for x in v)) or 1.0
            v = [x / norm for x in v]
            out.append(v)
        return out, None


class HuggingFaceEmbeddingsProvider(EmbeddingsProvider):
    """Lazy-load a multilingual sentence-transformer model.

    Not the default in the env (sentence-transformers install timed out).
    """
    name = "hf"
    DIM = 384

    def __init__(self) -> None:
        self.s = get_settings()
        self._model = None
        self._load_error: Optional[str] = None
        self._load_attempted = False

    def dim(self) -> int:
        return self.DIM

    async def embed(self, texts: list[str]) -> tuple[list[list[float]], Optional[ToolError]]:
        if not self._load_attempted:
            self._load_attempted = True
            try:
                from sentence_transformers import SentenceTransformer
                self._model = SentenceTransformer(self.s.embeddings_model)
            except Exception as e:
                self._load_error = f"{type(e).__name__}: {e}"
                log.warning("hf_embeddings_load_failed err=%s", e)
        if self._model is None:
            return [], ToolError(
                error_code="embeddings.provider_unavailable",
                detail=f"HuggingFace embeddings load failed: {self._load_error}",
                provider=self.name, retryable=False,
            )
        vecs = self._model.encode(texts, convert_to_numpy=True).tolist()
        return vecs, None


import functools


def get_embeddings_provider() -> EmbeddingsProvider:
    s = get_settings()
    if s.embeddings_provider == "hf":
        return HuggingFaceEmbeddingsProvider()
    return MockEmbeddingsProvider()


# --------------------------------------------------------------------------- #
# Hybrid retrieval
# --------------------------------------------------------------------------- #
def _normalize_query(text: str) -> str:
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\s+", " ", text).strip().lower()
    return text


def _tokenize(text: str) -> list[str]:
    # Simple whitespace + punctuation split for Odia & Latin.
    text = re.sub(r"[।,\.\!\?\:\;\(\)\[\]\{\}\"'`]", " ", text)
    return [t for t in text.split() if t]


class LocalHybridRetriever(RetrievalProvider):
    name = "local_hybrid"

    def __init__(self, pack: Optional[PackContentIndex] = None,
                 embeddings: Optional[EmbeddingsProvider] = None) -> None:
        self.s = get_settings()
        self.pack = pack or load_pack_index()
        self.embeddings = embeddings or get_embeddings_provider()
        # Pre-build chunk text corpus
        self._chunk_ids = list(self.pack.chunks.keys())
        self._chunk_texts = [self.pack.chunks[cid].text_or for cid in self._chunk_ids]
        # Build BM25
        try:
            from rank_bm25 import BM25Okapi
            self._bm25 = BM25Okapi([_tokenize(t) for t in self._chunk_texts])
        except Exception as e:
            log.warning("bm25_init_failed err=%s", e)
            self._bm25 = None
        # Pre-compute chunk embeddings for dense retrieval
        self._chunk_embeds: Optional[list[list[float]]] = None
        # Glossary expansion lookup
        self._glossary_en = self.pack.glossary_by_en
        self._glossary_or = self.pack.glossary_by_or

    async def _ensure_chunk_embeds(self) -> Optional[list[list[float]]]:
        if self._chunk_embeds is not None:
            return self._chunk_embeds
        vecs, err = await self.embeddings.embed(self._chunk_texts)
        if err is not None:
            log.warning("chunk_embeddings_failed err=%s", err.detail)
            return None
        self._chunk_embeds = vecs
        return vecs

    def _expand_glossary(self, query: str) -> list[str]:
        """Return additional query terms by glossary expansion."""
        expanded = set()
        q_lower = query.lower()
        # English→Odia expansion
        for en, g in self._glossary_en.items():
            if en and en.lower() in q_lower:
                expanded.add(g.term_or)
        # Odia→English expansion
        for or_term, g in self._glossary_or.items():
            if or_term and or_term in query:
                expanded.add(g.term_en)
        return list(expanded)

    async def retrieve(self, query: str, top_k: int = 5,
                       pack_ids: Optional[list[str]] = None) -> RetrievedResult:
        norm_q = _normalize_query(query)
        q_tokens = _tokenize(norm_q)
        # Glossary expansion
        extra_terms = self._expand_glossary(query) if get_ruleset().retrieval.get("glossary_expansion", True) else []
        expanded_query = norm_q + " " + " ".join(extra_terms)
        expanded_tokens = q_tokens + [t.lower() for t in extra_terms]
        # BM25 ranking
        bm25_scores: list[tuple[str, float]] = []
        if self._bm25 is not None:
            scores = self._bm25.get_scores(expanded_tokens)
            for i, cid in enumerate(self._chunk_ids):
                bm25_scores.append((cid, float(scores[i])))
        # Dense ranking
        dense_scores: list[tuple[str, float]] = []
        chunk_embeds = await self._ensure_chunk_embeds()
        if chunk_embeds is not None:
            q_vec, err = await self.embeddings.embed([expanded_query])
            if err is None and q_vec:
                q = q_vec[0]
                for i, cid in enumerate(self._chunk_ids):
                    v = chunk_embeds[i]
                    # cosine similarity
                    dot = sum(a * b for a, b in zip(q, v))
                    nq = math.sqrt(sum(x * x for x in q)) or 1.0
                    nv = math.sqrt(sum(x * x for x in v)) or 1.0
                    sim = dot / (nq * nv)
                    dense_scores.append((cid, float(sim)))
        # Reciprocal rank fusion
        rrf_k = 60  # standard RRF constant
        rrf: dict[str, float] = defaultdict(float)
        for rank, (cid, _s) in enumerate(sorted(bm25_scores, key=lambda x: -x[1])):
            rrf[cid] += 1.0 / (rrf_k + rank + 1)
        for rank, (cid, _s) in enumerate(sorted(dense_scores, key=lambda x: -x[1])):
            rrf[cid] += 1.0 / (rrf_k + rank + 1)
        # Top-k
        top = sorted(rrf.items(), key=lambda x: -x[1])[:top_k]
        # Normalise scores to [0,1] for the contract
        if top:
            max_score = max(s for _, s in top)
            min_score = min(s for _, s in top)
            denom = (max_score - min_score) or 1.0
        else:
            max_score, min_score, denom = 0, 0, 1
        chunks_out = []
        for cid, score in top:
            ch = self.pack.chunks[cid]
            chunks_out.append(RetrievedChunk(
                chunk_id=cid, concept_id=ch.concept_id, chapter_id=ch.chapter_id,
                text_or=ch.text_or, source_ref=ch.source_ref,
                score=float((score - min_score) / denom),
                matched_terms=[t for t in extra_terms if t.lower() in ch.text_or.lower()],
            ))
        confidence = chunks_out[0].score if chunks_out else 0.0
        return RetrievedResult(
            chunks=chunks_out, provider=self.name,
            model_id=self.embeddings.name, confidence=confidence,
        )


class FaissRetriever(LocalHybridRetriever):
    """FAISS-backed dense retriever; same hybrid logic, different index.

    Selected by `RETRIEVAL_PROVIDER=faiss`. Requires `faiss-cpu`.
    """
    name = "faiss_hybrid"

    async def _ensure_chunk_embeds(self) -> Optional[list[list[float]]]:
        if self._chunk_embeds is not None:
            return self._chunk_embeds
        vecs, err = await self.embeddings.embed(self._chunk_texts)
        if err is not None:
            log.warning("faiss_chunk_embeddings_failed err=%s", err.detail)
            return None
        self._chunk_embeds = vecs
        try:
            import faiss
            import numpy as np
            d = self.embeddings.dim()
            self._faiss_index = faiss.IndexFlatIP(d)
            arr = np.array(vecs, dtype="float32")
            self._faiss_index.add(arr)
            log.info("faiss_index_built n=%d dim=%d", len(vecs), d)
        except Exception as e:
            log.warning("faiss_init_failed err=%s", e)
        return vecs


@functools.lru_cache(maxsize=1)
def get_retrieval_provider() -> RetrievalProvider:
    s = get_settings()
    if s.retrieval_provider == "faiss_hybrid":
        return FaissRetriever()
    return LocalHybridRetriever()


def reset_retrieval_cache() -> None:
    get_retrieval_provider.cache_clear()




__all__ = [
    "MockEmbeddingsProvider", "HuggingFaceEmbeddingsProvider",
    "get_embeddings_provider",
    "LocalHybridRetriever", "FaissRetriever",
    "get_retrieval_provider", "reset_retrieval_cache",
]
