"""Assessment service — MCQ + short-answer, BKT mastery update, atomic event write."""
from __future__ import annotations

import time
from typing import Optional

from ..content.pack_loader import PackContentIndex
from ..domain.assess import evaluate_submission, evaluate_short_answer
from ..domain.bkt import bkt_band, bkt_update, evidence_from_event
from ..domain.ruleset import get_ruleset
from ..domain.schemas import (
    AssessmentResult, AssessmentSubmission, EvidenceType, EventType,
    LearnerEvent, MasteryRecord, Outcome, new_event_id,
)
from ..repositories import EventRepository, MasteryRepository


class AssessmentService:
    def __init__(self, pack: PackContentIndex, events: EventRepository,
                 mastery: MasteryRepository) -> None:
        self.pack = pack
        self.events = events
        self.mastery = mastery

    async def submit_assessment(
        self, learner_id: str, device_id: str, sub: AssessmentSubmission,
        seq: int,
    ) -> AssessmentResult:
        """Evaluate, persist event atomically, update mastery, return result.

        seq is the client-side monotonic sequence number for the event.
        """
        question = self.pack.get_question(sub.question_id)
        if not question:
            raise ValueError(f"unknown question: {sub.question_id}")
        if question.qtype == "mcq":
            correct, evidence = evaluate_submission(question, sub)
        else:
            correct, evidence = evaluate_short_answer(question, sub)
        # Build event
        ts = int(time.time() * 1000)
        event_id = new_event_id()
        event = LearnerEvent(
            event_id=event_id, device_id=device_id, seq=seq,
            learner_id=learner_id, ts=sub.submitted_at or ts,
            event_type=EventType.MCQ_ANSWERED if question.qtype == "mcq"
                       else EventType.SHORT_ANSWER_ATTEMPTED,
            concept_id=question.concept_id, chapter_id=question.chapter_id,
            question_id=question.question_id,
            payload={
                "evidence": evidence.value,
                "weight": 1.0,
                "correct": correct,
                "selected_option": sub.selected_option,
                "answer_text": sub.answer_text,
                "duration_ms": sub.duration_ms,
                "last_action": "ASSESS",
            },
        )
        # Insert event (idempotent by (device_id, seq))
        result = await self.events.insert_event(event)
        # Update mastery only on ACCEPTED, never on DUPLICATE
        ruleset = get_ruleset()
        if result.outcome == Outcome.ACCEPTED:
            existing = await self.mastery.get_mastery(learner_id)
            m = next((r for r in existing if r.concept_id == question.concept_id), None)
            p_prior = m.p_known if m else ruleset.bkt["priors"]["default_prior"]
            attempts = (m.attempts if m else 0) + 1
            correct_n = (m.correct if m else 0) + (1 if correct else 0)
            p_new = bkt_update(p_prior, evidence, ruleset, question.concept_id)
            band = bkt_band(p_new, ruleset)
            await self.mastery.upsert_mastery(
                learner_id=learner_id, concept_id=question.concept_id,
                p_known=p_new, band=band, attempts=attempts,
                correct=correct_n, last_updated_event_seq=seq,
            )
            m_after = MasteryRecord(
                concept_id=question.concept_id, p_known=p_new, band=band,
                attempts=attempts, correct=correct_n, last_updated_event_seq=seq,
            )
        else:
            # Use existing mastery snapshot (no update for duplicate)
            existing = await self.mastery.get_mastery(learner_id)
            m_after = next((r for r in existing if r.concept_id == question.concept_id),
                            MasteryRecord(concept_id=question.concept_id,
                                           p_known=ruleset.bkt["priors"]["default_prior"],
                                           band="novice", attempts=0, correct=0))
        return AssessmentResult(
            question_id=question.question_id, correct=correct, evidence=evidence,
            explanation_or=question.explanation_or,
            concept_id=question.concept_id, mastery_after=m_after,
            next_decision_id="",  # filled by the route layer after DecisionService
        )
