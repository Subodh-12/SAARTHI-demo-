"""API integration tests — actual SQLite DB, real routes."""
from __future__ import annotations

import asyncio
import os
import sys
import tempfile
import time
from pathlib import Path

import pytest
import pytest_asyncio
from fastapi.testclient import TestClient

REPO = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(REPO / "backend"))

TMP_DB = tempfile.mktemp(suffix=".db")
os.environ["DATABASE_URL"] = f"sqlite+aiosqlite:///{TMP_DB}"
os.environ["PERSISTENCE_BACKEND"] = "sqlite"
os.environ["TRANSLATION_PROVIDER"] = "mock"
os.environ["LLM_PROVIDER"] = "mock"

# Reset caches before importing the app
from app.core.settings import reset_settings_cache
from app.domain.ruleset import reset_ruleset_cache
from app.adapters.persistence import reset_persistence_for_tests, dispose_persistence
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

from app.main import create_app


@pytest.fixture
def client():
    app = create_app()
    with TestClient(app) as c:
        yield c


def test_health(client):
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ok"
    assert body["project"] == "SAARTHI"
    assert body["persistence"] == "sqlite"
    assert body["translation_provider"] == "mock"


def test_root(client):
    r = client.get("/")
    assert r.status_code == 200
    body = r.json()
    assert body["message"] == "Welcome to SAARTHI"


def test_legacy_lesson(client):
    r = client.get("/api/lesson")
    assert r.status_code == 200
    body = r.json()
    assert body["title"]  # has Odia title


def test_create_learner_returns_token(client):
    r = client.post("/api/v1/learners", json={
        "display_label": "Student1",
        "locale": "or", "grade": "class9", "subject": "science",
    })
    assert r.status_code == 200
    body = r.json()
    assert body["learner_id"].startswith("lrn_")
    assert body["device_id"].startswith("dev_")
    assert body["device_token"]
    assert body["token_expires_at"] > int(time.time() * 1000)


def test_content_chapters_listed(client):
    r = client.get("/api/v1/content/chapters")
    assert r.status_code == 200
    chapters = r.json()
    assert len(chapters) == 3
    for ch in chapters:
        assert ch["chapter_id"].startswith("ch00")


def test_pack_manifest_listed(client):
    r = client.get("/api/v1/packs/manifest")
    assert r.status_code == 200
    packs = r.json()
    assert len(packs) >= 1
    assert packs[0]["pack_id"] == "pack_class9_science_or_v1"


def test_unauth_blocked_on_protected_routes(client):
    r = client.get("/api/v1/learners/me")
    assert r.status_code == 401
    r = client.post("/api/v1/decisions/next", json={"network": "online"})
    assert r.status_code == 401
    r = client.get("/api/v1/state")
    assert r.status_code == 401


def test_full_learning_loop(client):
    """Create learner → next decision → submit assessment → fetch state."""
    # 1. Create learner
    r = client.post("/api/v1/learners", json={
        "display_label": "Loop1", "locale": "or", "grade": "class9", "subject": "science",
    })
    auth = r.json()
    token = auth["device_token"]
    headers = {"Authorization": f"Bearer {token}", "X-Event-Seq": "1"}

    # 2. Get next decision
    r = client.post("/api/v1/decisions/next", json={"network": "online"}, headers=headers)
    assert r.status_code == 200
    d = r.json()
    assert d["action"] in ("REMEDIATE", "RETRY", "REVISE", "ADVANCE")
    assert d["target_concept_id"].startswith("c")

    # 3. Submit assessment
    concept_id = d["target_concept_id"]
    q = client.get(f"/api/v1/content/concepts/{concept_id}/questions/next",
                    headers=headers).json()
    assert q["question_id"]
    sub = {
        "question_id": q["question_id"],
        "selected_option": q.get("correct_option"),
        "duration_ms": 4200, "submitted_at": int(time.time()*1000),
        "evidence": "none",
    }
    r = client.post("/api/v1/assessments", json=sub, headers=headers)
    assert r.status_code == 200
    result = r.json()
    assert result["correct"] is True
    assert result["mastery_after"]["p_known"] > 0.4

    # 4. Fetch learner state — should show mastery
    r = client.get("/api/v1/state", headers=headers)
    assert r.status_code == 200
    state = r.json()
    assert state["mastery"]
    assert state["last_decision_id"]


def test_doubt_query(client):
    r = client.post("/api/v1/learners", json={
        "display_label": "Doubt1", "locale": "or", "grade": "class9", "subject": "science",
    })
    auth = r.json()
    headers = {"Authorization": f"Bearer {auth['device_token']}"}
    r = client.post("/api/v1/doubts/query",
                     json={"query": "ପଦାର୍ଥ କଣ", "learner_id": auth["learner_id"], "pack_ids": []},
                     headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["answer"]["text_or"]
    assert body["retrieved"]["chunks"]


def test_error_response_rfc7807(client):
    r = client.get("/api/v1/state")
    assert r.status_code == 401
    assert r.headers["content-type"].startswith("application/problem+json")
    body = r.json()
    assert body["error_code"] == "unauthenticated"
    assert body["type"].startswith("https://saarthi.app/errors/")
    assert "request_id" in body


def test_sync_endpoint_idempotent(client):
    """Submit the same event twice → second is DUPLICATE."""
    r = client.post("/api/v1/learners", json={
        "display_label": "Sync1", "locale": "or", "grade": "class9", "subject": "science",
    })
    auth = r.json()
    headers = {"Authorization": f"Bearer {auth['device_token']}"}
    event = {
        "event_id": f"evt_fixed_{'a'*20}",
        "device_id": auth["device_id"],
        "seq": 1,
        "learner_id": auth["learner_id"],
        "ts": int(time.time() * 1000),
        "event_type": "mcq_answered",
        "concept_id": "c0001",
        "chapter_id": "ch001",
        "question_id": "q_ch01_c0001_01",
        "payload": {"evidence": "correct", "weight": 1.0, "correct": True, "last_action": "ASSESS"},
        "outbox_state": "pending", "retry_count": 0,
    }
    sync_req = {"device_id": auth["device_id"], "learner_id": auth["learner_id"],
                "from_seq": 0, "events": [event]}
    r = client.post("/api/v1/sync", json=sync_req, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"][0]["outcome"] == "accepted"
    # Resubmit
    r = client.post("/api/v1/sync", json=sync_req, headers=headers)
    assert r.status_code == 200
    body = r.json()
    assert body["accepted"][0]["outcome"] == "duplicate"
