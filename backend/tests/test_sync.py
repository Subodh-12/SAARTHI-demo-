"""M7 sync tests — idempotency, ordering, dead-letter, replay."""
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
    SqlMasteryRepository,
)
from app.domain.schemas import (
    EventType, LearnerEvent, LearnerProfile, Outcome, SyncRequest, new_device_id,
    new_event_id, new_learner_id,
)
from app.services import SyncService


@pytest_asyncio.fixture
async def setup():
    p = await reset_persistence_for_tests()
    events = SqlEventRepository(p)
    mastery = SqlMasteryRepository(p)
    decisions = SqlDecisionRepository(p)
    learners = SqlLearnerRepository(p)
    svc = SyncService(events, mastery, decisions)
    learner_id = new_learner_id()
    device_id = new_device_id()
    profile = LearnerProfile(
        learner_id=learner_id, display_label="T", created_at=int(time.time()*1000),
        locale="or", grade="class9", subject="science", pin_hash=None,
    )
    await learners.create_learner(profile, device_id)
    yield svc, learner_id, device_id, events
    await p.dispose()


def _make_event(device_id, learner_id, seq, evidence="correct"):
    return LearnerEvent(
        event_id=new_event_id(), device_id=device_id, seq=seq,
        learner_id=learner_id, ts=int(time.time()*1000),
        event_type=EventType.MCQ_ANSWERED, concept_id="c0001",
        question_id="q_ch01_c0001_01",
        payload={"evidence": evidence, "weight": 1.0, "correct": evidence == "correct",
                  "last_action": "ASSESS"},
    )


async def test_sync_idempotent_resubmit(setup):
    svc, learner_id, device_id, _ = setup
    ev = _make_event(device_id, learner_id, seq=1)
    resp = await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                       from_seq=0, events=[ev]))
    assert len(resp.accepted) == 1
    assert resp.accepted[0].outcome == Outcome.ACCEPTED
    # Resubmit — should be DUPLICATE
    resp2 = await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                        from_seq=0, events=[ev]))
    assert resp2.accepted[0].outcome == Outcome.DUPLICATE


async def test_sync_canonical_mastery_replay(setup):
    svc, learner_id, device_id, _ = setup
    ev1 = _make_event(device_id, learner_id, seq=1, evidence="correct")
    ev2 = _make_event(device_id, learner_id, seq=2, evidence="incorrect")
    resp = await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                       from_seq=0, events=[ev1, ev2]))
    assert all(r.outcome == Outcome.ACCEPTED for r in resp.accepted)
    # Canonical mastery for c0001 should reflect: correct then incorrect
    m = [r for r in resp.canonical_mastery if r.concept_id == "c0001"]
    assert m, "canonical mastery should include c0001"
    assert m[0].attempts == 2
    assert m[0].correct == 1


async def test_sync_out_of_order_rejected(setup):
    svc, learner_id, device_id, _ = setup
    ev1 = _make_event(device_id, learner_id, seq=5)
    ev2 = _make_event(device_id, learner_id, seq=3)
    from app.core.errors import SaarthiError
    with pytest.raises(SaarthiError) as e:
        await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                    from_seq=0, events=[ev1, ev2]))
    assert "ordering" in str(e.value).lower() or "ordering" in e.value.detail.lower()


async def test_sync_multi_device_rejected(setup):
    """D-009: event with mismatched learner_id or device_id is rejected."""
    svc, learner_id, device_id, _ = setup
    ev = _make_event(device_id, learner_id, seq=1)
    ev.learner_id = new_learner_id()  # different learner
    resp = await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                       from_seq=0, events=[ev]))
    assert resp.accepted[0].outcome == Outcome.REJECTED


async def test_sync_dead_letter(setup):
    svc, learner_id, device_id, events = setup
    ev = _make_event(device_id, learner_id, seq=1)
    ev.learner_id = new_learner_id()
    await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                               from_seq=0, events=[ev]))
    # The dead-letter table should have 1 entry for this event
    from sqlalchemy import text
    async with events.p.engine.connect() as c:
        res = await c.execute(text("SELECT COUNT(*) FROM dead_letter_events"))
        n = res.scalar()
    assert n == 1


async def test_sync_batch_too_large(setup):
    svc, learner_id, device_id, _ = setup
    from app.core.errors import SaarthiError
    big_batch = [_make_event(device_id, learner_id, seq=i+1) for i in range(200)]
    with pytest.raises(SaarthiError):
        await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                   from_seq=0, events=big_batch))


async def test_sync_returns_next_decision(setup):
    """Sync should also compute and return the next decision (post-reconnect)."""
    svc, learner_id, device_id, _ = setup
    ev = _make_event(device_id, learner_id, seq=1)
    resp = await svc.sync(SyncRequest(device_id=device_id, learner_id=learner_id,
                                       from_seq=0, events=[ev]))
    assert resp.next_decision is not None
    assert resp.next_decision.target_concept_id
