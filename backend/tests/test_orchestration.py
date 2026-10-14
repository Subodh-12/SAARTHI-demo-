"""M8 orchestration tests — translate_text tool, retrieval, validation, fallbacks."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
from pathlib import Path

import pytest

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mktemp(suffix='.db')}"
os.environ["PERSISTENCE_BACKEND"] = "sqlite"
os.environ["TRANSLATION_PROVIDER"] = "mock"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["EMBEDDINGS_PROVIDER"] = "mock"

from app.adapters.ai.translation import get_translation_provider, MockTranslationProvider
from app.adapters.ai.retrieval import get_retrieval_provider, LocalHybridRetriever
from app.adapters.ai.generation import get_generation_provider, MockGenerationProvider
from app.domain.schemas import DoubtRequest, GeneratedAnswer, RetrievedChunk, RetrievedResult
from app.orchestration.graph import run_doubt, OrchestrationState
from app.orchestration import validators


def _run(coro):
    try:
        loop = asyncio.get_event_loop()
        if loop.is_closed():
            raise RuntimeError()
    except RuntimeError:
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)
    return loop.run_until_complete(coro)


def test_translation_mock_returns_typed_unavailable():
    provider = get_translation_provider()
    assert isinstance(provider, MockTranslationProvider)
    result = _run(provider.translate("hi", "or", "en"))
    assert hasattr(result, "error_code")
    assert result.error_code == "translation.provider_unavailable"


def test_translation_passthrough_same_lang():
    provider = get_translation_provider()
    result = _run(provider.translate("ପଦାର୍ଥ", "or", "or"))
    assert hasattr(result, "text")
    assert result.text == "ପଦାର୍ଥ"
    assert result.confidence == 1.0


def test_retrieval_local_hybrid_returns_chunks():
    provider = get_retrieval_provider()
    assert isinstance(provider, LocalHybridRetriever)
    result = _run(provider.retrieve("ପଦାର୍ଥ କଣ", top_k=3))
    assert len(result.chunks) > 0
    assert result.provider == "local_hybrid"


def test_generation_mock_returns_extractive():
    provider = get_generation_provider()
    assert isinstance(provider, MockGenerationProvider)
    chunks = [RetrievedChunk(
        chunk_id="chunk_ch01_c0001_01", concept_id="c0001", chapter_id="ch001",
        text_or="ପଦାର୍ଥ ହେଉଛି ସବୁ ଯାହାର ଭାର ଅଛି।", source_ref="ch01 §1.2",
        score=0.8, matched_terms=[],
    )]
    from app.adapters.ai.interfaces import GenerationRequest
    text, citations, err = _run(
        provider.generate(GenerationRequest(query="ପଦାର୍ଥ କଣ", retrieved_chunks=chunks)))
    assert err is None
    assert "ପଦାର୍ଥ" in text
    assert citations == ["chunk_ch01_c0001_01"]


@pytest.mark.asyncio
async def test_orchestration_doubt_odia_query():
    """End-to-end doubt orchestration with an Odia query."""
    resp = await run_doubt(DoubtRequest(
        query="ପଦାର୍ଥ କଣ?", learner_id="lrn_0123456789abcdef", pack_ids=[],
    ))
    assert resp.answer.text_or
    assert resp.retrieved.chunks
    assert resp.answer.provenance in ("extractive", "llm_grounded", "basic")
    assert resp.decision_id


@pytest.mark.asyncio
async def test_orchestration_translation_called_for_latin_query():
    """Latin-script query triggers translate_text (returns typed unavailable; falls back)."""
    resp = await run_doubt(DoubtRequest(
        query="What is matter in science?", learner_id="lrn_0123456789abcdef", pack_ids=[],
    ))
    assert resp.used_translation_tool is True


@pytest.mark.asyncio
async def test_validation_extractive_passes():
    """The extractive answer should pass all validation gates."""
    answer = GeneratedAnswer(
        text_or="ପଦାର୍ଥ ହେଉଛି ସବୁ ଯାହାର ଭାର ଅଛି।",
        citations=["chunk_ch01_c0001_01"], confidence=0.9, provenance="extractive",
    )
    retrieved = RetrievedResult(
        chunks=[RetrievedChunk(
            chunk_id="chunk_ch01_c0001_01", concept_id="c0001", chapter_id="ch001",
            text_or="ପଦାର୍ଥ ହେଉଛି ସବୁ ଯାହାର ଭାର ଅଛି।",
            source_ref="ch01 §1.2", score=0.9, matched_terms=[],
        )], provider="local_hybrid", confidence=0.9,
    )
    verdict = validators.validate_answer(answer, retrieved)
    assert verdict.ok, f"failed gate: {verdict.failed_gate}"
    assert "schema" in verdict.gates_passed
    assert "citation" in verdict.gates_passed
    assert "language" in verdict.gates_passed


def test_validation_unknown_citation_fails():
    answer = GeneratedAnswer(
        text_or="ଉତ୍ତର", citations=["chunk_does_not_exist_xx"], confidence=0.5, provenance="extractive",
    )
    retrieved = RetrievedResult(chunks=[], provider="none", confidence=0)
    verdict = validators.validate_answer(answer, retrieved)
    assert not verdict.ok
    assert verdict.failed_gate == "citation.unknown_chunk_id"


def test_validation_low_odia_ratio_fails():
    answer = GeneratedAnswer(
        text_or="This is an English answer not in Odia",
        citations=[], confidence=0.5, provenance="llm_grounded",
    )
    retrieved = RetrievedResult(chunks=[], provider="none", confidence=0)
    verdict = validators.validate_answer(answer, retrieved)
    assert not verdict.ok
    assert verdict.failed_gate == "language.odia_ratio_low"


def test_validation_out_of_lessons_passes():
    answer = GeneratedAnswer(
        text_or="ଏହି ପ୍ରଶ୍ନ ଆମ ପାଠ୍ଟକ୍ରମରେ ନାହିଁ।",
        citations=[], confidence=0.0, provenance="basic",
        basic_answer_status="out_of_lessons",
    )
    retrieved = RetrievedResult(chunks=[], provider="none", confidence=0)
    verdict = validators.validate_answer(answer, retrieved)
    assert verdict.ok, f"failed: {verdict.failed_gate}"
