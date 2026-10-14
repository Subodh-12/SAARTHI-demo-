"""End-to-end smoke test of the SAARTHI MVP loop, using a temp SQLite DB.

Verifies:
- Auth: device registration + learner creation + token issuance
- Assessment: MCQ submit → BKT mastery update → event persisted
- Decision: next_decision uses mastery + ruleset
- Sync: idempotent replay, per-event outcome
- Doubt: orchestration graph runs translate→retrieve→generate→validate with extractive fallback
"""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

# Ensure the backend is importable
REPO = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(REPO / "backend"))

# Use a temp DB for this smoke test
TMP_DB = tempfile.mktemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TMP_DB}"
os.environ["PERSISTENCE_BACKEND"] = "sqlite"
os.environ["TRANSLATION_PROVIDER"] = "mock"
os.environ["LLM_PROVIDER"] = "mock"
os.environ["RETRIEVAL_PROVIDER"] = "local_hybrid"
os.environ["EMBEDDINGS_PROVIDER"] = "mock"

# Reset caches
from app.core.settings import reset_settings_cache
from app.domain.ruleset import reset_ruleset_cache
from app.adapters.persistence import reset_persistence_for_tests
from app.adapters.ai.translation import reset_translation_cache
from app.adapters.ai.retrieval import reset_retrieval_cache
from app.adapters.ai.generation import reset_generation_cache
from app.content.pack_loader import reset_pack_cache

reset_settings_cache()
reset_ruleset_cache()
reset_translation_cache()
reset_retrieval_cache()
reset_generation_cache()
reset_pack_cache()

from app.adapters.persistence import Persistence
from app.adapters.persistence.repositories import (
    SqlDecisionRepository, SqlDeviceRepository, SqlEventRepository,
    SqlLearnerRepository, SqlMasteryRepository, SqlPackRepository,
)
from app.services import AuthService, AssessmentService, DecisionService, DoubtService, SyncService
from app.domain.schemas import (
    AssessmentSubmission, DoubtRequest, EvidenceType, EventType,
    LearnerEvent, LearnerProfileCreate, NetworkState, new_device_id,
    new_event_id,
)
from app.content.pack_loader import load_pack_index


async def main():
    p = await reset_persistence_for_tests()
    learners = SqlLearnerRepository(p)
    devices = SqlDeviceRepository(p)
    events = SqlEventRepository(p)
    mastery = SqlMasteryRepository(p)
    decisions = SqlDecisionRepository(p)
    packs_repo = SqlPackRepository(p)

    pack = load_pack_index()
    auth = AuthService(learners, devices)
    assessment = AssessmentService(pack, events, mastery)
    decision_svc = DecisionService(pack, mastery, decisions)
    doubt = DoubtService(pack, decisions)
    sync = SyncService(events, mastery, decisions)

    # 1. Device register + learner create
    device_id = new_device_id()
    await auth.register_device(device_id, "shared-android-low-end")
    auth_resp = await auth.create_learner(device_id, LearnerProfileCreate(display_label="Student1"))
    print(f"[1] learner={auth_resp.learner_id} device={auth_resp.device_id}")

    # 2. Submit an MCQ (correct answer)
    # Find an MCQ question for c0001
    q = next(q for q in pack.questions.values() if q.concept_id == "c0001" and q.qtype == "mcq")
    sub = AssessmentSubmission(
        question_id=q.question_id, selected_option=q.correct_option,
        duration_ms=4200, submitted_at=int(time.time() * 1000),
        evidence=EvidenceType.NONE,
    )
    result = await assessment.submit_assessment(
        auth_resp.learner_id, device_id, sub, seq=1)
    print(f"[2] mcq correct: {result.correct} evidence={result.evidence.value} "
          f"mastery.p_known={result.mastery_after.p_known:.3f} band={result.mastery_after.band}")
    assert result.correct, "MCQ correct should be True"
    assert result.mastery_after.p_known > 0.4, "BKT mastery should rise on correct"

    # 3. Submit an MCQ (incorrect answer)
    wrong_option = (q.correct_option + 1) % len(q.options)
    sub2 = AssessmentSubmission(
        question_id=q.question_id, selected_option=wrong_option,
        duration_ms=5100, submitted_at=int(time.time() * 1000),
        evidence=EvidenceType.NONE,
    )
    result2 = await assessment.submit_assessment(
        auth_resp.learner_id, device_id, sub2, seq=2)
    print(f"[3] mcq wrong: {result2.correct} mastery.p_known={result2.mastery_after.p_known:.3f}")
    assert not result2.correct, "MCQ wrong should be False"
    assert result2.mastery_after.p_known < result.mastery_after.p_known, "mastery should drop"

    # 4. Get next decision
    decision = await decision_svc.next_decision(
        auth_resp.learner_id, NetworkState.ONLINE,
        trigger_event_type="mcq_answered",
        trigger_concept_id="c0001",
        trigger_evidence="incorrect",
        recent_events=[],
    )
    print(f"[4] decision: action={decision.action.value} target={decision.target_concept_id} "
          f"delivery={decision.delivery_mode.value} reason={decision.reason_code}")
    assert decision.action.value in ("REMEDIATE", "RETRY", "REVISE", "ADVANCE")
    assert decision.target_concept_id, "target_concept_id should be set"

    # 5. Sync test — re-submit the same events (should be DUPLICATE)
    ev1 = LearnerEvent(
        event_id=new_event_id(), device_id=device_id, seq=1,
        learner_id=auth_resp.learner_id, ts=int(time.time() * 1000),
        event_type=EventType.MCQ_ANSWERED, concept_id="c0001",
        question_id=q.question_id,
        payload={"evidence": "correct", "weight": 1.0, "last_action": "ASSESS"},
    )
    ev2 = LearnerEvent(
        event_id=new_event_id(), device_id=device_id, seq=2,
        learner_id=auth_resp.learner_id, ts=int(time.time() * 1000),
        event_type=EventType.MCQ_ANSWERED, concept_id="c0001",
        question_id=q.question_id,
        payload={"evidence": "incorrect", "weight": 1.0, "last_action": "ASSESS"},
    )
    from app.domain.schemas import SyncRequest
    sync_resp = await sync.sync(SyncRequest(
        device_id=device_id, learner_id=auth_resp.learner_id,
        from_seq=0, events=[ev1, ev2],
    ))
    print(f"[5] sync: outcomes={[r.outcome.value for r in sync_resp.accepted]}")
    assert all(r.outcome.value == "duplicate" for r in sync_resp.accepted), \
        "resubmitted events should be duplicates"
    assert sync_resp.canonical_mastery, "canonical mastery should be returned"
    print(f"    canonical_mastery[0]: {sync_resp.canonical_mastery[0]}")

    # 6. Doubt — ask an Odia question
    doubt_resp = await doubt.ask(DoubtRequest(
        query="ପଦାର୍ଥ ଶିଖ — କଠିନ ତରଳ ଗ୍ୟାସ କଣ?",
        learner_id=auth_resp.learner_id, pack_ids=["pack_class9_science_or_v1"],
    ))
    print(f"[6] doubt: provenance={doubt_resp.answer.provenance} "
          f"citations={doubt_resp.answer.citations} "
          f"retrieved_chunks={len(doubt_resp.retrieved.chunks)}")
    assert doubt_resp.answer.text_or, "answer should have text"
    assert doubt_resp.retrieved.chunks, "should retrieve chunks"
    assert doubt_resp.answer.provenance in ("extractive", "llm_grounded", "basic")

    await p.dispose()
    try:
        os.unlink(TMP_DB)
    except OSError:
        pass
    print("\n*** ALL SMOKE CHECKS PASSED ***")


if __name__ == "__main__":
    asyncio.run(main())
