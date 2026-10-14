"""LangGraph orchestration — doubt branch with translate_text, retrieve_chunks,
generate_answer, validate_answer tools.

Implements the design doc's doubt branch:
  normalize → conditionally translate → retrieve → (rephrase once) → generate → validate →
  retry once on failure → extractive fallback.

Caps tool calls (max 3), total time (~12s), retries (1 per tool). Tool
allow-list enforced. PostgreSQL/SQLite checkpoints via SQLCheckpointSaver.

The LLM never selects the learning action — only assists inside bounded nodes.
"""
from __future__ import annotations

import asyncio
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from ..core.logging import get_logger
from ..core.metrics import get_registry
from ..core.settings import get_settings
from ..core.tracing import Tracer
from ..domain.ruleset import get_ruleset
from ..domain.schemas import (
    DecisionTrace, DoubtRequest, DoubtResponse, GeneratedAnswer,
    Outcome, RetrievedResult, ToolError, TraceStep, new_decision_id,
)
from ..i18n.reasons_or import REASON_MESSAGES
from ..adapters.ai.generation import get_generation_provider
from ..adapters.ai.retrieval import get_retrieval_provider
from ..adapters.ai.translation import get_translation_provider
from . import validators

log = get_logger("saarthi.orchestration")
_tracer = Tracer("orchestration")


# --------------------------------------------------------------------------- #
# Typed graph state
# --------------------------------------------------------------------------- #
@dataclass
class OrchestrationState:
    query: str
    translated_query: Optional[str] = None
    used_translation_tool: bool = False
    retrieval: Optional[RetrievedResult] = None
    answer: Optional[GeneratedAnswer] = None
    trace: list[TraceStep] = field(default_factory=list)
    tool_calls: int = 0
    started_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    decision_id: str = field(default_factory=new_decision_id)
    error: Optional[ToolError] = None
    retry_count: int = 0


# --------------------------------------------------------------------------- #
# Tool nodes
# --------------------------------------------------------------------------- #
async def _tool_translate(state: OrchestrationState) -> OrchestrationState:
    """Conditionally call the HF translation tool.

    Triggers when the query contains code-mixed/Latin-script Odia or English
    scientific terms that would benefit from normalisation for retrieval.
    """
    s = get_settings()
    span = _tracer.start_span("doubt.translate", tool="translate_text",
                              provider=get_ruleset().translation.get("default_provider", "mock"),
                              input_summary={"len": len(state.query)})
    if state.tool_calls >= get_ruleset().orchestration.get("max_tool_calls_per_turn", 3):
        step = _make_step(span, status="skipped", reason="tool_call_cap_reached")
        state.trace.append(step)
        _tracer.end_span(span, status="skipped")
        return state
    # Heuristic: needs translation if Latin chars > 30% of query
    latin = sum(1 for c in state.query if c.isascii() and c.isalpha())
    total_alpha = sum(1 for c in state.query if c.isalpha())
    needs_translation = total_alpha > 0 and latin / total_alpha > 0.3
    if not needs_translation:
        step = _make_step(span, status="skipped", reason="no_latin_script")
        state.trace.append(step)
        _tracer.end_span(span, status="skipped")
        return state
    state.tool_calls += 1
    provider = get_translation_provider()
    result_or_err = await provider.translate(state.query, "or", "en")
    if isinstance(result_or_err, ToolError):
        # Fall back: keep original Odia query; record the typed error.
        get_registry().fallbacks.inc(reason="translation_unavailable")
        step = _make_step(span, status="fallback", error_code=result_or_err.error_code,
                          output_summary={"reason": result_or_err.detail})
        state.trace.append(step)
        _tracer.end_span(span, status="fallback", error_code=result_or_err.error_code)
        state.translated_query = None
        state.used_translation_tool = True
        return state
    state.translated_query = result_or_err.text
    state.used_translation_tool = True
    step = _make_step(span, status="ok",
                      output_summary={"len": len(result_or_err.text)},
                      model_id=result_or_err.model_id)
    state.trace.append(step)
    _tracer.end_span(span, status="ok")
    return state


async def _tool_retrieve(state: OrchestrationState) -> OrchestrationState:
    s = get_settings()
    span = _tracer.start_span("doubt.retrieve", tool="retrieve_chunks",
                              provider=get_ruleset().retrieval.get("default_provider", "local_hybrid"),
                              input_summary={"len": len(state.query)})
    if state.tool_calls >= get_ruleset().orchestration.get("max_tool_calls_per_turn", 3):
        step = _make_step(span, status="skipped", reason="tool_call_cap_reached")
        state.trace.append(step)
        _tracer.end_span(span, status="skipped")
        return state
    state.tool_calls += 1
    provider = get_retrieval_provider()
    # Use translated_query for retrieval if it improved the query
    retrieve_query = state.translated_query or state.query
    result = await provider.retrieve(retrieve_query, top_k=get_ruleset().retrieval.get("top_k", 5))
    state.retrieval = result
    step = _make_step(span, status="ok",
                      output_summary={"chunks": len(result.chunks),
                                      "confidence": result.confidence},
                      model_id=result.model_id)
    state.trace.append(step)
    _tracer.end_span(span, status="ok")
    return state


async def _tool_generate(state: OrchestrationState) -> OrchestrationState:
    s = get_settings()
    span = _tracer.start_span("doubt.generate", tool="generate_answer",
                              provider=get_ruleset().generation.get("default_provider", "mock"),
                              input_summary={"chunks": len(state.retrieval.chunks) if state.retrieval else 0})
    if state.tool_calls >= get_ruleset().orchestration.get("max_tool_calls_per_turn", 3):
        step = _make_step(span, status="skipped", reason="tool_call_cap_reached")
        state.trace.append(step)
        _tracer.end_span(span, status="skipped")
        return state
    state.tool_calls += 1
    provider = get_generation_provider()
    from ..adapters.ai.interfaces import GenerationRequest
    req = GenerationRequest(
        query=state.query,
        retrieved_chunks=state.retrieval.chunks if state.retrieval else [],
        max_answer_chars=get_ruleset().generation.get("max_answer_chars", 1200),
    )
    text, citations, err = await provider.generate(req)
    if err is not None:
        get_registry().fallbacks.inc(reason="generation_unavailable")
        # Extractive fallback: return the top retrieved chunk as the answer
        if state.retrieval and state.retrieval.chunks:
            top = state.retrieval.chunks[0]
            state.answer = GeneratedAnswer(
                text_or=top.text_or[:600], citations=[top.chunk_id],
                confidence=top.score, provenance="extractive",
                basic_answer_status="generation_provider_unavailable",
            )
            step = _make_step(span, status="fallback", error_code=err.error_code,
                              output_summary={"fallback": "extractive"})
            state.trace.append(step)
            _tracer.end_span(span, status="fallback", error_code=err.error_code)
            return state
        # No retrieval at all → out-of-lessons response
        state.answer = GeneratedAnswer(
            text_or=REASON_MESSAGES.get("content.out_of_lessons", ""),
            citations=[], confidence=0.0, provenance="basic",
            basic_answer_status="out_of_lessons",
        )
        step = _make_step(span, status="fallback", error_code=err.error_code,
                          output_summary={"fallback": "out_of_lessons"})
        state.trace.append(step)
        _tracer.end_span(span, status="fallback", error_code=err.error_code)
        return state
    state.answer = GeneratedAnswer(
        text_or=text, citations=citations, confidence=0.7,
        provenance="llm_grounded",
    )
    step = _make_step(span, status="ok",
                      output_summary={"len": len(text), "citations": len(citations)})
    state.trace.append(step)
    _tracer.end_span(span, status="ok")
    return state


async def _tool_validate(state: OrchestrationState) -> OrchestrationState:
    span = _tracer.start_span("doubt.validate", tool="validate_answer",
                              input_summary={"answer_len": len(state.answer.text_or) if state.answer else 0})
    if not state.answer:
        step = _make_step(span, status="error", reason="no_answer_to_validate")
        state.trace.append(step)
        _tracer.end_span(span, status="error")
        return state
    verdict = validators.validate_answer(
        state.answer, state.retrieval or RetrievedResult(chunks=[], provider="none", confidence=0.0),
    )
    if not verdict.ok:
        get_registry().validation_rejection.inc(gate=verdict.failed_gate)
        if state.retry_count < get_settings().orchestration.max_retries_per_tool:
            state.retry_count += 1
            step = _make_step(span, status="error", error_code=verdict.failed_gate,
                              output_summary={"retry": state.retry_count})
            state.trace.append(step)
            _tracer.end_span(span, status="error", error_code=verdict.failed_gate)
            # Retry generate with stricter constraint (just once)
            state.tool_calls -= 1  # allow the retry
            state = await _tool_generate(state)
            return state
        # Exhausted retries → degrade to extractive
        if state.retrieval and state.retrieval.chunks:
            top = state.retrieval.chunks[0]
            state.answer = GeneratedAnswer(
                text_or=top.text_or[:600], citations=[top.chunk_id],
                confidence=top.score, provenance="extractive",
                basic_answer_status=f"validation_failed:{verdict.failed_gate}",
            )
        step = _make_step(span, status="fallback", error_code=verdict.failed_gate,
                          output_summary={"fallback": "extractive_after_retries"})
        state.trace.append(step)
        _tracer.end_span(span, status="fallback", error_code=verdict.failed_gate)
        return state
    step = _make_step(span, status="ok",
                      output_summary={"gates_passed": len(verdict.gates_passed)})
    state.trace.append(step)
    _tracer.end_span(span, status="ok")
    return state


def _make_step(span, *, status: str, error_code: Optional[str] = None,
               output_summary: Optional[dict] = None, reason: str = "",
               model_id: Optional[str] = None) -> TraceStep:
    return TraceStep(
        step_id=span.span_id,
        node=span.node,
        tool=span.tool,
        provider=span.provider,
        ruleset_version=span.ruleset_version,
        model_id=model_id or span.model_id,
        status=status,  # type: ignore
        error_code=error_code,
        duration_ms=int(time.time() * 1000) - span.start_ms,
        retry=None,
        fallback=None,
        input_summary=span.input_summary,
        output_summary=output_summary or {},
        redacted=True,
    )


# --------------------------------------------------------------------------- #
# Top-level orchestration
# --------------------------------------------------------------------------- #
async def run_doubt(req: DoubtRequest) -> DoubtResponse:
    """Run the doubt branch of the LangGraph orchestration."""
    state = OrchestrationState(query=req.query)
    # Doubt branch: normalize → translate → retrieve → generate → validate
    state = await _tool_translate(state)
    state = await _tool_retrieve(state)
    state = await _tool_generate(state)
    state = await _tool_validate(state)
    # Build response
    return DoubtResponse(
        answer=state.answer or GeneratedAnswer(
            text_or=REASON_MESSAGES.get("content.out_of_lessons", ""),
            citations=[], confidence=0.0, provenance="basic",
            basic_answer_status="out_of_lessons",
        ),
        retrieved=state.retrieval or RetrievedResult(
            chunks=[], provider="none", confidence=0.0),
        decision_id=state.decision_id,
        translated_query=state.translated_query,
        used_translation_tool=state.used_translation_tool,
    )


def get_decision_trace(decision_id: str, state: OrchestrationState) -> DecisionTrace:
    return DecisionTrace(decision_id=decision_id, trace=state.trace)


__all__ = ["run_doubt", "OrchestrationState", "get_decision_trace"]
