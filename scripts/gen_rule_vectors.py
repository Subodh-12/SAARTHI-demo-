"""Generate shared test vectors for the deterministic decision engine.

Produces `tests/fixtures/rule_vectors.json` consumed by both the Python
test suite (`tests/test_decide_vectors.py`) and the TypeScript suite
(`frontend/tests/decide.test.ts`).

Each vector has the same shape as `DecisionInput` so both engines see
identical inputs and must return identical outputs.
"""
from __future__ import annotations

import json
import os
import random
import sys
from pathlib import Path

# Make the engine importable when run from anywhere
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "backend"))

from app.domain.decide import (  # type: ignore
    DecisionInput, apply_repetition_guard, decide, select_action,
    select_background_actions, select_delivery_mode, select_target_concept,
)
from app.domain.bkt import bkt_update  # type: ignore
from app.domain.ruleset import get_ruleset  # type: ignore
from app.domain.schemas import Action, BackgroundAction, DeliveryMode, NetworkState  # type: ignore


REASON_MESSAGES: dict[str, str] = {
    "target.unstarted_no_prereqs_needed": "ନୂଆ ଧାରଣା ଆରମ୍ଭ କରିବା।",
    "target.prerequisite_unstarted": "ପ୍ରଥମ ଆଧାର ଧାରଣା ଶିଖ।",
    "target.prerequisite_not_mastered": "ପ୍ରଥମ ଆଧାର ଧାରଣା ବଦ୍ଧ କର।",
    "target.first_unmastered_with_prereqs": "ଏହି ଧାରଣା ଉପରେ କାମ କର।",
    "target.fallback_first_concept": "ପ୍ରଥମ ଧାରଣା ଆରମ୍ଭ କର।",
    "target.lowest_mastery_fallback": "ସବୁଠା ଦୁର୍ବଳ ଧାରଣା ଉପରେ ମନ୍ଦନ କର।",
    "action.remediate_low_mastery_or_incorrect": "ଆଜି ଉତ୍ତର ଭୁଲ ଥିଲା। ପୁଣି ଶିଖ।",
    "action.retry_below_threshold": "ଆଉକି ଚେଷ୍ଟା କର।",
    "action.revise_below_threshold": "ପୁଣି ରିଭିଜନ୍ କର।",
    "action.revise_safe_default": "ପୁଣି ରିଭିଜନ୍ କର।",
    "action.advance_mastered": "ସାବଧାନ! ପରବର୍ତ୍ତୀ ଧାରଣା କୁ ଯାଅ।",
    "guard.escape_to_revise_not_ready_to_advance": "ବାରମ୍ବାର ଉନ୍ନତି ପାଇଁ ରିଭିଜନ୍ କର।",
    "guard.escape_action": "ପୁଣି ରିଭିଜନ୍ କର।",
    "guard.escape_loop_on_same_concept": "ଏହି ଧାରଣା କୁ ବାରମ୍ବାର ବଦ୍ଧ କର।",
}

CONCEPTS = [
    ("c0001", "ch001"),
    ("c0002", "ch001"),
    ("c0003", "ch001"),
    ("c0004", "ch002"),
    ("c0005", "ch002"),
    ("c0006", "ch002"),
    ("c0007", "ch003"),
    ("c0008", "ch003"),
    ("c0009", "ch003"),
]
PREREQS = {
    "c0001": [],
    "c0002": ["c0001"],
    "c0003": ["c0002"],
    "c0004": [],
    "c0005": ["c0004"],
    "c0006": ["c0005"],
    "c0007": [],
    "c0008": ["c0007"],
    "c0009": ["c0008"],
}
CONCEPT_ORDER = [c for c, _ in CONCEPTS]
CHAPTER_FOR_CONCEPT = {c: ch for c, ch in CONCEPTS}


def band(p: float, ruleset) -> str:
    th = ruleset.mastery["thresholds"]
    if p < th["unstarted_lo"]: return "unstarted"
    if p < th["novice_hi"]: return "novice"
    if p < th["developing_hi"]: return "developing"
    if p < th["proficient_hi"]: return "proficient"
    return "mastered"


def gen_vectors(seed: int = 42, n: int = 240) -> list[dict]:
    """Build `n` deterministic scenarios by enumerating state combinations."""
    rng = random.Random(seed)
    ruleset = get_ruleset()
    vectors: list[dict] = []
    # Enumerate coverage scenarios first — every mastery band × every network × every action.
    mastery_p_levels = [0.05, 0.2, 0.39, 0.4, 0.55, 0.7, 0.85, 0.92]
    networks = [NetworkState.ONLINE, NetworkState.WEAK, NetworkState.OFFLINE, NetworkState.RECONNECTED]
    evidences = ["correct", "incorrect", "partial", "none"]
    actions_payload = [Action.REMEDIATE, Action.RETRY, Action.REVISE, Action.ADVANCE]

    for net in networks:
        for evidence in evidences:
            for p in mastery_p_levels:
                for recent_action_count in (0, 1, 2, 3):  # for repetition guard coverage
                    target_cid = rng.choice(CONCEPT_ORDER)
                    # Build mastery: target has p; all prereqs vary
                    mastery: dict[str, tuple[float, str, int, int]] = {}
                    for cid in CONCEPT_ORDER:
                        if cid == target_cid:
                            mastery[cid] = (p, band(p, ruleset), 5, max(0, 3 if evidence == "correct" else 1))
                        else:
                            mp = rng.choice(mastery_p_levels)
                            mastery[cid] = (mp, band(mp, ruleset), rng.randint(0, 5), rng.randint(0, 4))
                    recent = [
                        {"concept_id": target_cid, "payload": {"last_action": rng.choice(actions_payload).value}}
                        for _ in range(recent_action_count)
                    ]
                    inp = DecisionInput(
                        trigger_event_type="mcq_answered",
                        trigger_concept_id=target_cid,
                        trigger_evidence=evidence,
                        mastery=mastery,
                        recent_events=recent,
                        prereqs=PREREQS,
                        env_network=net,
                        installed_pack_versions={"pack_class9_science_v1": "1.0.0"},
                        ruleset_version=ruleset.ruleset_version,
                        concept_order=CONCEPT_ORDER,
                        chapter_id_for_concept=CHAPTER_FOR_CONCEPT,
                    )
                    out = decide(inp, ruleset, REASON_MESSAGES)
                    vectors.append({
                        "input": _serialise_input(inp),
                        "expected": _serialise_output(out),
                    })
                    if len(vectors) >= n:
                        return vectors
    # Pad with random variations until n
    while len(vectors) < n:
        target_cid = rng.choice(CONCEPT_ORDER)
        mastery = {}
        for cid in CONCEPT_ORDER:
            p = rng.choice(mastery_p_levels)
            mastery[cid] = (p, band(p, ruleset), rng.randint(0, 10), rng.randint(0, 6))
        recent = [
            {"concept_id": target_cid, "payload": {"last_action": rng.choice(actions_payload).value}}
            for _ in range(rng.randint(0, 3))
        ]
        inp = DecisionInput(
            trigger_event_type=rng.choice(["mcq_answered", "lesson_opened", "doubt_asked"]),
            trigger_concept_id=target_cid,
            trigger_evidence=rng.choice(evidences),
            mastery=mastery,
            recent_events=recent,
            prereqs=PREREQS,
            env_network=rng.choice(networks),
            installed_pack_versions={"pack_class9_science_v1": "1.0.0"},
            ruleset_version=ruleset.ruleset_version,
            concept_order=CONCEPT_ORDER,
            chapter_id_for_concept=CHAPTER_FOR_CONCEPT,
        )
        out = decide(inp, ruleset, REASON_MESSAGES)
        vectors.append({"input": _serialise_input(inp), "expected": _serialise_output(out)})
    return vectors


def _serialise_input(inp: DecisionInput) -> dict:
    return {
        "trigger_event_type": inp.trigger_event_type,
        "trigger_concept_id": inp.trigger_concept_id,
        "trigger_evidence": inp.trigger_evidence,
        "mastery": {k: {"p": v[0], "band": v[1], "attempts": v[2], "correct": v[3]}
                    for k, v in inp.mastery.items()},
        "recent_events": inp.recent_events,
        "prereqs": inp.prereqs,
        "env_network": inp.env_network.value,
        "installed_pack_versions": inp.installed_pack_versions,
        "ruleset_version": inp.ruleset_version,
        "concept_order": inp.concept_order,
        "chapter_id_for_concept": inp.chapter_id_for_concept,
        "suggested_chunk_id": inp.suggested_chunk_id,
        "suggested_question_id": inp.suggested_question_id,
    }


def _serialise_output(out) -> dict:
    return {
        "action": out.action.value,
        "delivery_mode": out.delivery_mode.value,
        "background_actions": [a.value for a in out.background_actions],
        "target_concept_id": out.target_concept_id,
        "chapter_id": out.chapter_id,
        "reason_code": out.reason_code,
        "reason_or": out.reason_or,
        "suggested_chunk_id": out.suggested_chunk_id,
        "suggested_question_id": out.suggested_question_id,
    }


def main() -> None:
    fixtures_dir = Path(__file__).resolve().parent.parent / "tests" / "fixtures"
    fixtures_dir.mkdir(parents=True, exist_ok=True)
    vectors = gen_vectors(seed=42, n=240)
    out_path = fixtures_dir / "rule_vectors.json"
    out_path.write_text(json.dumps({
        "ruleset_version": get_ruleset().ruleset_version,
        "reason_messages": REASON_MESSAGES,
        "vectors": vectors,
    }, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"wrote {len(vectors)} vectors to {out_path}")


if __name__ == "__main__":
    main()
