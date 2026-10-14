"""Shared rule vectors — Python side.

Loads `tests/fixtures/rule_vectors.json` (produced by
`scripts/gen_rule_vectors.py`) and verifies the Python decision engine
returns the expected output for every vector. The TypeScript test
suite at `frontend/tests/decide.test.ts` runs the same vectors through
the TS engine.
"""
from __future__ import annotations

import json
from pathlib import Path

import pytest

from app.domain.decide import DecisionInput, decide
from app.domain.ruleset import get_ruleset
from app.domain.schemas import Action, BackgroundAction, DeliveryMode, NetworkState

FIXTURE = Path(__file__).resolve().parents[2] / "tests" / "fixtures" / "rule_vectors.json"


def _load_vectors() -> list[dict]:
    data = json.loads(FIXTURE.read_text(encoding="utf-8"))
    assert data["ruleset_version"] == get_ruleset().ruleset_version, "ruleset version mismatch"
    return data["vectors"]


VECTORS = _load_vectors()
REASON_MESSAGES = json.loads(FIXTURE.read_text(encoding="utf-8"))["reason_messages"]


def _to_input(v: dict) -> DecisionInput:
    inp = v["input"]
    mastery = {
        cid: (m["p"], m["band"], m["attempts"], m["correct"])
        for cid, m in inp["mastery"].items()
    }
    return DecisionInput(
        trigger_event_type=inp["trigger_event_type"],
        trigger_concept_id=inp["trigger_concept_id"],
        trigger_evidence=inp["trigger_evidence"],
        mastery=mastery,
        recent_events=inp["recent_events"],
        prereqs=inp["prereqs"],
        env_network=NetworkState(inp["env_network"]),
        installed_pack_versions=inp["installed_pack_versions"],
        ruleset_version=inp["ruleset_version"],
        concept_order=inp["concept_order"],
        chapter_id_for_concept=inp["chapter_id_for_concept"],
        suggested_chunk_id=inp.get("suggested_chunk_id"),
        suggested_question_id=inp.get("suggested_question_id"),
    )


@pytest.mark.parametrize("vector", VECTORS, ids=[f"v{i:03d}" for i in range(len(VECTORS))])
def test_vector(vector) -> None:
    ruleset = get_ruleset()
    out = decide(_to_input(vector), ruleset, REASON_MESSAGES)
    expected = vector["expected"]
    assert out.action.value == expected["action"]
    assert out.delivery_mode.value == expected["delivery_mode"]
    assert [a.value for a in out.background_actions] == expected["background_actions"]
    assert out.target_concept_id == expected["target_concept_id"]
    assert out.chapter_id == expected["chapter_id"]
    assert out.reason_code == expected["reason_code"]
    assert out.reason_or == expected["reason_or"]
