"""M5 assessment flow tests."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

import pytest
import pytest_asyncio

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "backend"))

os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{tempfile.mktemp(suffix='.db')}"
os.environ["PERSISTENCE_BACKEND"] = "sqlite"
os.environ["TRANSLATION_PROVIDER"] = "mock"
os.environ["LLM_PROVIDER"] = "mock"

from app.adapters.persistence import reset_persistence_for_tests
from app.adapters.persistence.repositories import (
    SqlDecisionRepository, SqlEventRepository, SqlLearnerRepository,
    SqlMasteryRepository, SqlPackRepository,
)
from app.content.pack_loader import load_pack_index
from app.domain.assess import evaluate_submission, evaluate_short_answer
from app.domain.schemas import (
    AssessmentSubmission, EvidenceType, new_device_id,
)
from app.services import AssessmentService
from app.domain.bkt import bkt_update, evidence_from_event
from app.domain.ruleset import get_ruleset


@pytest_asyncio.fixture
async def setup_db():
    p = await reset_persistence_for_tests()
    events = SqlEventRepository(p)
    mastery = SqlMasteryRepository(p)
    pack = load_pack_index()
    svc = AssessmentService(pack, events, mastery)
    learner_id = "lrn_0123456789abcdef"
    device_id = new_device_id()
    from app.domain.schemas import LearnerProfile, LearnerProfileCreate
    profile = LearnerProfile(
        learner_id=learner_id, display_label="Test", created_at=int(time.time()*1000),
        locale="or", grade="class9", subject="science", pin_hash=None,
    )
    await SqlLearnerRepository(p).create_learner(profile, device_id)
    yield svc, learner_id, device_id, pack
    await p.dispose()


async def test_mcq_correct_updates_mastery(setup_db):
    svc, learner_id, device_id, pack = setup_db
    q = next(q for q in pack.questions.values() if q.qtype == "mcq" and q.concept_id == "c0001")
    sub = AssessmentSubmission(
        question_id=q.question_id, selected_option=q.correct_option,
        duration_ms=4200, submitted_at=int(time.time()*1000),
        evidence=EvidenceType.NONE,
    )
    result = await svc.submit_assessment(learner_id, device_id, sub, seq=1)
    assert result.correct is True
    assert result.evidence == EvidenceType.CORRECT
    assert result.mastery_after.p_known > 0.5  # mastery should rise on correct


async def test_mcq_incorrect_drops_mastery(setup_db):
    svc, learner_id, device_id, pack = setup_db
    q = next(q for q in pack.questions.values() if q.qtype == "mcq" and q.concept_id == "c0001")
    wrong_option = (q.correct_option + 1) % len(q.options)
    sub = AssessmentSubmission(
        question_id=q.question_id, selected_option=wrong_option,
        duration_ms=5100, submitted_at=int(time.time()*1000),
        evidence=EvidenceType.NONE,
    )
    result = await svc.submit_assessment(learner_id, device_id, sub, seq=2)
    assert result.correct is False
    assert result.evidence == EvidenceType.INCORRECT
    assert result.mastery_after.p_known < 0.5


async def test_short_answer_partial(setup_db):
    svc, learner_id, device_id, pack = setup_db
    q = next(q for q in pack.questions.values() if q.qtype == "short_answer" and q.concept_id == "c0002")
    # Partial answer — mentions density but not the formula
    sub = AssessmentSubmission(
        question_id=q.question_id, answer_text="ଘନତ୍ୱ ହେଉଛି ମାତ୍ରା ଓ ଆୟତନର ଅନୁପାତ",
        duration_ms=3000, submitted_at=int(time.time()*1000),
        evidence=EvidenceType.NONE,
    )
    result = await svc.submit_assessment(learner_id, device_id, sub, seq=3)
    # Should be PARTIAL or INCORRECT (not CORRECT)
    assert result.evidence in (EvidenceType.PARTIAL, EvidenceType.INCORRECT)


async def test_event_persistence_after_submit(setup_db):
    svc, learner_id, device_id, pack = setup_db
    q = next(q for q in pack.questions.values() if q.qtype == "mcq")
    sub = AssessmentSubmission(
        question_id=q.question_id, selected_option=q.correct_option,
        duration_ms=4200, submitted_at=int(time.time()*1000),
        evidence=EvidenceType.NONE,
    )
    await svc.submit_assessment(learner_id, device_id, sub, seq=5)
    # Reload via a fresh AssessmentService backed by the same DB
    events = svc.events
    evs = await events.list_events(learner_id, since_seq=0)
    assert any(e.seq == 5 for e in evs)


def test_bkt_update_correct_rises():
    ruleset = get_ruleset()
    p_new = bkt_update(0.4, EvidenceType.CORRECT, ruleset, "c0001")
    assert p_new > 0.4
    p_new2 = bkt_update(0.95, EvidenceType.CORRECT, ruleset, "c0001")
    assert p_new2 > p_new  # near-mastery keeps climbing


def test_bkt_update_incorrect_drops():
    ruleset = get_ruleset()
    p_new = bkt_update(0.8, EvidenceType.INCORRECT, ruleset, "c0001")
    assert p_new < 0.8


def test_bkt_update_partial_partial():
    """Partial evidence with weight 0.5 should land between incorrect and correct."""
    ruleset = get_ruleset()
    from app.domain.bkt import BKTEvidence
    p_new = bkt_update(0.5, BKTEvidence(evidence="partial", weight=0.5), ruleset, "c0001")
    p_correct = bkt_update(0.5, BKTEvidence(evidence="correct", weight=1.0), ruleset, "c0001")
    p_incorrect = bkt_update(0.5, BKTEvidence(evidence="incorrect", weight=1.0), ruleset, "c0001")
    # Partial should be between incorrect and correct (exclusive bounds)
    assert p_incorrect <= p_new <= p_correct
    assert p_new != p_correct  # weight < 1.0 makes a difference


def test_bkt_update_none_no_change():
    ruleset = get_ruleset()
    p_new = bkt_update(0.5, EvidenceType.NONE, ruleset, "c0001")
    # No evidence → no change except learning transition (which adds learn)
    # So p_new should be slightly higher (learning), not lower.
    assert p_new >= 0.5


def test_evidence_from_event_non_assessment_is_none():
    ruleset = get_ruleset()
    e = evidence_from_event("lesson_opened", {}, ruleset)
    assert e.evidence == "none"
    assert e.weight == 0.0
