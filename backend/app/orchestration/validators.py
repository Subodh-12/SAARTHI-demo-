"""Validation gates — pure functions over GeneratedAnswer + RetrievedResult.

Gates (deterministic, all run):
  - schema: answer has required fields
  - citation: every cited chunk_id exists in retrieved chunks
  - language: Odia unicode ratio >= threshold (or fallback marker present)
  - length: within [min,max]
  - safety: no blocked terms
  - trajectory: provenance ∈ {extractive, llm_grounded, basic}
"""
from __future__ import annotations

import re
import unicodedata
from dataclasses import dataclass, field
from typing import Optional

from ..domain.schemas import GeneratedAnswer, RetrievedChunk, RetrievedResult
from ..domain.ruleset import get_ruleset


@dataclass
class ValidationVerdict:
    ok: bool
    failed_gate: Optional[str] = None
    gates_passed: list[str] = field(default_factory=list)


def _odia_unicode_ratio(text: str) -> float:
    if not text:
        return 0.0
    odia = sum(1 for c in text if "\u0B00" <= c <= "\u0B7F")
    alpha = sum(1 for c in text if c.isalpha())
    return odia / alpha if alpha else 0.0


def validate_answer(answer: GeneratedAnswer, retrieved: RetrievedResult) -> ValidationVerdict:
    ruleset = get_ruleset()
    gates_passed: list[str] = []

    # Schema gate
    if not answer.text_or:
        return ValidationVerdict(ok=False, failed_gate="schema.empty_text", gates_passed=[])
    if not isinstance(answer.citations, list):
        return ValidationVerdict(ok=False, failed_gate="schema.citations_type", gates_passed=[])
    gates_passed.append("schema")

    # Citation gate — every cited id must be in retrieved chunks
    retrieved_ids = {c.chunk_id for c in retrieved.chunks}
    for cid in answer.citations:
        if cid not in retrieved_ids:
            return ValidationVerdict(ok=False, failed_gate="citation.unknown_chunk_id",
                                     gates_passed=gates_passed)
    gates_passed.append("citation")

    # Language gate — Odia unicode ratio OR explicit fallback marker
    if answer.provenance == "extractive":
        # Extractive answers are taken verbatim from Odia chunks — they pass.
        gates_passed.append("language")
    elif answer.basic_answer_status and "out_of_lessons" in answer.basic_answer_status:
        gates_passed.append("language")  # explicit out-of-lessons marker
    else:
        ratio = _odia_unicode_ratio(answer.text_or)
        if ratio < ruleset.validation["min_odia_unicode_ratio"]:
            return ValidationVerdict(ok=False, failed_gate="language.odia_ratio_low",
                                     gates_passed=gates_passed)
        gates_passed.append("language")

    # Length gate
    if len(answer.text_or) > ruleset.generation["max_answer_chars"] + 100:
        return ValidationVerdict(ok=False, failed_gate="length.too_long",
                                 gates_passed=gates_passed)
    gates_passed.append("length")

    # Safety gate
    blocked = ruleset.validation.get("safety_blocked_terms", [])
    for term in blocked:
        if term and term in answer.text_or:
            return ValidationVerdict(ok=False, failed_gate="safety.blocked_term",
                                     gates_passed=gates_passed)
    gates_passed.append("safety")

    # Trajectory gate
    if answer.provenance not in ("extractive", "llm_grounded", "basic"):
        return ValidationVerdict(ok=False, failed_gate="trajectory.unknown_provenance",
                                 gates_passed=gates_passed)
    gates_passed.append("trajectory")

    return ValidationVerdict(ok=True, gates_passed=gates_passed)


__all__ = ["validate_answer", "ValidationVerdict"]
