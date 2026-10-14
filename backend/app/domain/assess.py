"""Assessment domain rules — pure functions.

MCQ is deterministic. Short-answer uses a reviewed rubric (expected_concepts
list) and a deterministic local evaluator. The local evaluator scores
"correct" only when ALL expected concepts appear in the learner's answer;
otherwise "partial" if >=50% appear; otherwise "incorrect". This is the
design doc's "deterministic local evaluation fallback".

When an online evaluator is configured (M9 generation provider), the local
verdict is still computed and attached as a deterministic baseline; the LLM
may refine the partial verdict under strict constraints (handled in the
orchestration layer, not here).
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any

from .schemas import AssessmentSubmission, EvidenceType, Question


def normalise_odia(text: str) -> str:
    if not text:
        return ""
    text = unicodedata.normalize("NFC", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text.lower()


def evaluate_submission(question: Question, sub: AssessmentSubmission) -> tuple[bool, EvidenceType]:
    """MCQ evaluation: deterministic. Returns (correct, evidence)."""
    if question.qtype != "mcq":
        raise ValueError(f"question {question.question_id} is not MCQ")
    if question.correct_option is None:
        raise ValueError("question has no correct_option")
    if sub.selected_option is None:
        return False, EvidenceType.NONE
    if sub.selected_option == question.correct_option:
        return True, EvidenceType.CORRECT
    return False, EvidenceType.INCORRECT


def evaluate_short_answer(question: Question, sub: AssessmentSubmission) -> tuple[bool, EvidenceType]:
    """Short-answer: deterministic rubric-based evaluation.

    Correct if ALL expected concepts appear in the answer (substring match
    after normalisation). Partial if >=50% appear. Otherwise incorrect.
    """
    if question.qtype != "short_answer":
        raise ValueError(f"question {question.question_id} is not short_answer")
    answer = normalise_odia(sub.answer_text or "")
    if not answer:
        return False, EvidenceType.NONE
    expected = [normalise_odia(c) for c in question.expected_concepts]
    if not expected:
        # Fallback to keyword overlap with the rubric.
        rubric = normalise_odia(question.rubric_or or "")
        if not rubric:
            return False, EvidenceType.INCORRECT
        return _partial(answer, [rubric])
    return _partial(answer, expected)


def _partial(answer: str, expected: list[str]) -> tuple[bool, EvidenceType]:
    hits = sum(1 for c in expected if c and c in answer)
    if hits == len(expected):
        return True, EvidenceType.CORRECT
    if hits >= max(1, len(expected) // 2):
        return False, EvidenceType.PARTIAL
    return False, EvidenceType.INCORRECT


__all__ = ["evaluate_submission", "evaluate_short_answer", "normalise_odia"]
