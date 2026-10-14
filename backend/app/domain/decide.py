"""Deterministic decision engine — pure functions over explicit inputs.

This is the SHARED RULESET CONTRACT that runs identically in Python (server)
and TypeScript (browser). The TypeScript implementation lives at
`frontend/src/engine/decide.ts` and consumes the SAME `packages/ruleset/rules.json`.

Rules:
  - The LLM NEVER selects the action.
  - First-match action rules; repetition guard; prerequisite-aware target selection.
  - Returns exactly one REMEDIATE/RETRY/REVISE/ADVANCE action, a delivery mode
    (rich/cached/prefetch_then_offline), and zero or more background actions.

Inputs (pure data — no I/O):
  - trigger: last event (event_type, evidence, concept_id, payload)
  - mastery: dict[concept_id -> (p_known, band, attempts, correct)]
  - recent_events: list of recent events (for repetition guard + last_concept)
  - prereqs: dict[concept_id -> list[concept_id]]
  - env: EnvironmentSnapshot (network, pack versions, ruleset_version)
  - ruleset: Ruleset
  - concept_order: list[concept_id] in canonical chapter order
  - reason_messages_or: dict[reason_code -> Odia reason text]  (loaded from i18n)
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Optional

from .bkt import bkt_band
from .ruleset import Ruleset, mastery_band
from .schemas import (
    Action,
    BackgroundAction,
    DeliveryMode,
    NetworkState,
)


@dataclass
class DecisionInput:
    trigger_event_type: str
    trigger_concept_id: Optional[str]
    trigger_evidence: str  # "correct" | "incorrect" | "partial" | "none"
    mastery: dict[str, tuple[float, str, int, int]]  # concept_id -> (p, band, attempts, correct)
    recent_events: list[dict[str, Any]]  # ordered most-recent-last, small N (e.g. 10)
    prereqs: dict[str, list[str]]  # concept_id -> list of prerequisite concept_ids
    env_network: NetworkState
    installed_pack_versions: dict[str, str]
    ruleset_version: str
    concept_order: list[str]
    suggested_chunk_id: Optional[str] = None
    suggested_question_id: Optional[str] = None
    chapter_id_for_concept: dict[str, str] = field(default_factory=dict)


@dataclass
class DecisionOutput:
    action: Action
    delivery_mode: DeliveryMode
    background_actions: list[BackgroundAction]
    target_concept_id: str
    chapter_id: str
    reason_code: str
    reason_or: str
    suggested_chunk_id: Optional[str] = None
    suggested_question_id: Optional[str] = None


# --------------------------------------------------------------------------- #
# Repetition guard
# --------------------------------------------------------------------------- #
def _recent_same_action_count(recent: list[dict], action: str) -> int:
    n = 0
    for ev in reversed(recent):
        if ev.get("payload", {}).get("last_action") == action:
            n += 1
        else:
            break
    return n


def _recent_same_concept_count(recent: list[dict], concept_id: str) -> int:
    n = 0
    for ev in reversed(recent):
        if ev.get("concept_id") == concept_id:
            n += 1
        else:
            break
    return n


# --------------------------------------------------------------------------- #
# Target-concept selection
# --------------------------------------------------------------------------- #
def select_target_concept(inp: DecisionInput, ruleset: Ruleset,
                          reason_messages: dict[str, str]) -> tuple[str, str, str]:
    """Return (target_concept_id, reason_code, reason_or).

    Strategy: first unmastered concept whose prerequisites are mastered;
    fall back to the lowest-mastery concept in canonical order (tie-break by
    concept_id ascending — deterministic).
    """
    th = ruleset.mastery["thresholds"]
    advance_threshold = ruleset.actions["advance_threshold"]
    # First pass: first unmastered with prereqs satisfied
    for cid in inp.concept_order:
        if cid not in inp.mastery:
            return cid, "target.unstarted_no_prereqs_needed", reason_messages.get(
                "target.unstarted_no_prereqs_needed", "ନୂଆ ଧାରଣା ଆରମ୍ଭ କରିବା।")
        p, band, _, _ = inp.mastery[cid]
        if band in ("mastered",):
            continue
        if p >= advance_threshold:
            continue
        # check prereqs
        ok = True
        for pre in inp.prereqs.get(cid, []):
            if pre not in inp.mastery:
                # prereq unstarted — select the prereq instead
                return pre, "target.prerequisite_unstarted", reason_messages.get(
                    "target.prerequisite_unstarted", "ପ୍ରଥମ ଆଧାର ଧାରଣା ଶିଖ।")
            pre_p, pre_band, _, _ = inp.mastery[pre]
            if pre_p < ruleset.actions["advance_threshold"]:
                return pre, "target.prerequisite_not_mastered", reason_messages.get(
                    "target.prerequisite_not_mastered", "ପ୍ରଥମ ଆଧାର ଧାରଣା ବଦ୍ଧ କର।")
        if ok:
            return cid, "target.first_unmastered_with_prereqs", reason_messages.get(
                "target.first_unmastered_with_prereqs", "ଏହି ଧାରଣା ଉପରେ କାମ କର।")
    # Fallback: lowest-mastery concept, tie-break by concept_id
    if not inp.mastery:
        # nothing mastered yet, nothing in order — pick first concept
        if inp.concept_order:
            return inp.concept_order[0], "target.fallback_first_concept", reason_messages.get(
                "target.fallback_first_concept", "ପ୍ରଥମ ଧାରଣା ଆରମ୍ଭ କର।")
        return "", "target.no_concepts_available", reason_messages.get(
            "target.no_concepts_available", "କୌଣସି ଧାରଣା ନାହିଁ।")
    sorted_concepts = sorted(
        inp.mastery.items(),
        key=lambda kv: (kv[1][0], kv[0]),
    )
    cid, (p, band, _, _) = sorted_concepts[0]
    return cid, "target.lowest_mastery_fallback", reason_messages.get(
        "target.lowest_mastery_fallback", "ସବୁଠା ଦୁର୍ବଳ ଧାରଣା ଉପରେ ମନ୍ଦନ କର।")


# --------------------------------------------------------------------------- #
# Action selection — first-match rules
# --------------------------------------------------------------------------- #
def select_action(inp: DecisionInput, target_cid: str, ruleset: Ruleset) -> tuple[Action, str]:
    """First-match rule selection over the *target* concept.

    Returns (action, reason_code).

    Rules (in order):
      1. If trigger evidence was incorrect OR mastery < remediate_threshold: REMEDIATE
      2. Else if mastery < retry_threshold: RETRY
      3. Else if mastery < revise_threshold: REVISE
      4. Else if mastery >= advance_threshold: ADVANCE
      5. Else: REVISE (safe default that doesn't escape loops)

    The repetition guard (see below) overrides any action that has been taken
    `max_consecutive_same_action` times in a row by switching to `escape_action`.
    """
    p_known, band, attempts, correct = (inp.mastery.get(target_cid) or (0.4, "novice", 0, 0))
    th = ruleset.actions
    evidence = inp.trigger_evidence

    if evidence == "incorrect" or p_known < th["remediate_threshold"]:
        return Action.REMEDIATE, "action.remediate_low_mastery_or_incorrect"
    if p_known < th["retry_threshold"]:
        return Action.RETRY, "action.retry_below_threshold"
    if p_known < th["revise_threshold"]:
        return Action.REVISE, "action.revise_below_threshold"
    if p_known >= th["advance_threshold"]:
        return Action.ADVANCE, "action.advance_mastered"
    return Action.REVISE, "action.revise_safe_default"


def apply_repetition_guard(action: Action, inp: DecisionInput,
                            ruleset: Ruleset) -> tuple[Action, str]:
    """If the proposed action has been taken N times in a row, switch to escape_action.

    The guard does NOT bypass prerequisite/mastery requirements: if the escape
    action is ADVANCE but mastery is below the advance_threshold, fall back to
    REVISE instead. (See prompt M4.3: "do not advance merely to escape a loop.")
    """
    guard = ruleset.repetition_guard
    n_same = _recent_same_action_count(inp.recent_events, action.value)
    if n_same < guard["max_consecutive_same_action"]:
        return action, "guard.no_override"

    escape = Action(guard["escape_action"])
    target_cid = inp.trigger_concept_id or ""
    p_known = (inp.mastery.get(target_cid) or (0.4, "novice", 0, 0))[0]
    advance_threshold = ruleset.actions["advance_threshold"]
    if escape == Action.ADVANCE and p_known < advance_threshold:
        # Don't escape to ADVANCE when not ready — REVISE instead.
        return Action.REVISE, "guard.escape_to_revise_not_ready_to_advance"
    n_same_concept = _recent_same_concept_count(inp.recent_events, target_cid) if target_cid else 0
    if n_same_concept >= guard["max_consecutive_same_concept"] and escape == Action.ADVANCE:
        return Action.REVISE, "guard.escape_loop_on_same_concept"
    return escape, "guard.escape_action"


# --------------------------------------------------------------------------- #
# Delivery mode + background actions
# --------------------------------------------------------------------------- #
def select_delivery_mode(network: NetworkState, ruleset: Ruleset) -> DeliveryMode:
    return DeliveryMode(ruleset.delivery.get(network.value, "cached"))


def select_background_actions(network: NetworkState, ruleset: Ruleset) -> list[BackgroundAction]:
    raw = ruleset.background_actions.get(network.value, [])
    return [BackgroundAction(a) for a in raw]


# --------------------------------------------------------------------------- #
# Top-level decide()
# --------------------------------------------------------------------------- #
def decide(inp: DecisionInput, ruleset: Ruleset,
           reason_messages: Optional[dict[str, str]] = None) -> DecisionOutput:
    rm = reason_messages or {}
    target_cid, reason_code, reason_or = select_target_concept(inp, ruleset, rm)
    if not target_cid:
        return DecisionOutput(
            action=Action.REVISE,
            delivery_mode=select_delivery_mode(inp.env_network, ruleset),
            background_actions=select_background_actions(inp.env_network, ruleset),
            target_concept_id="",
            chapter_id=inp.chapter_id_for_concept.get("", ""),
            reason_code=reason_code,
            reason_or=reason_or,
        )
    action, action_reason = select_action(inp, target_cid, ruleset)
    action, guard_reason = apply_repetition_guard(action, inp, ruleset)
    final_reason_code = guard_reason if guard_reason != "guard.no_override" else action_reason
    chapter_id = inp.chapter_id_for_concept.get(target_cid, "")
    return DecisionOutput(
        action=action,
        delivery_mode=select_delivery_mode(inp.env_network, ruleset),
        background_actions=select_background_actions(inp.env_network, ruleset),
        target_concept_id=target_cid,
        chapter_id=chapter_id,
        reason_code=final_reason_code,
        reason_or=rm.get(final_reason_code, _default_reason_or(final_reason_code, action, target_cid)),
        suggested_chunk_id=inp.suggested_chunk_id,
        suggested_question_id=inp.suggested_question_id,
    )


def _default_reason_or(reason_code: str, action: Action, target_cid: str) -> str:
    """Hard fallback Odia reasons — used when i18n dict is missing keys.

    NOTE: These are NOT generated by an LLM. They are fixed educational
    strings shipped with the app and localised via the i18n dictionary.
    """
    defaults = {
        "action.remediate_low_mastery_or_incorrect": "ଆଜି ଉତ୍ତର ଭୁଲ୍ ଥିଲା। ପୁଣି ଶିଖ।",
        "action.retry_below_threshold": "ଆଉକି ଚେଷ୍ଟା କର।",
        "action.revise_below_threshold": "ପୁଣି ରିଭିଜନ୍ କର।",
        "action.revise_safe_default": "ପୁଣି ରିଭିଜନ୍ କର।",
        "action.advance_mastered": "ସାବଧାନ! ପରବର୍ତ୍ତୀ ଧାରଣା କୁ ଯାଅ।",
        "guard.escape_to_revise_not_ready_to_advance": "ବାରମ୍ବାର ଉନ୍ନତି ପାଇଁ ରିଭିଜନ୍ କର।",
        "guard.escape_action": "ପୁଣି ରିଭିଜନ୍ କର।",
        "guard.escape_loop_on_same_concept": "ଏହି ଧାରଣା କୁ ବାରମ୍ବାର ବଦ୍ଧ କର।",
    }
    return defaults.get(reason_code, f"ଆଗାମୀ କାମ: {action.value}")


__all__ = [
    "DecisionInput",
    "DecisionOutput",
    "decide",
    "select_target_concept",
    "select_action",
    "apply_repetition_guard",
    "select_delivery_mode",
    "select_background_actions",
]
