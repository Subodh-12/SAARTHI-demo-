"""Bayesian Knowledge Tracing (BKT) — pure functions.

BKT updates a per-concept probability of mastery `P(known)` from assessment
evidence. Non-assessment events (lesson viewed, doubt asked) do NOT count
as evidence — they carry `evidence=none`/`weight=0`.

Formulas (standard 4-parameter BKT, no forgetting for MVP):
  P(known | correct)   = P(known) * (1 - slip) /
                         (P(known) * (1 - slip) + (1 - P(known)) * guess)
  P(known | incorrect) = P(known) * slip /
                         (P(known) * slip + (1 - P(known)) * (1 - guess))
  P(known | partial)    = interpolate (treat as 0.5 weight against prior)
  After each evidence, apply learning: P(known) ← P(known) + (1 - P(known)) * learn
"""
from __future__ import annotations

from dataclasses import dataclass
from typing import Optional

from .ruleset import Ruleset


@dataclass
class BKTEvidence:
    evidence: str  # "correct" | "incorrect" | "partial" | "none"
    weight: float = 1.0


def bkt_params(ruleset: Ruleset, concept_id: Optional[str] = None) -> tuple[float, float, float, float]:
    """Return (prior, learn, slip, guess) — per-concept overrides if present."""
    p = ruleset.bkt["priors"]
    overrides = ruleset.bkt.get("per_concept_overrides", {}).get(concept_id or "", {}) or {}
    return (
        float(overrides.get("default_prior", p["default_prior"])),
        float(overrides.get("default_learn", p["default_learn"])),
        float(overrides.get("default_slip", p["default_slip"])),
        float(overrides.get("default_guess", p["default_guess"])),
    )


def bkt_update(p_known: float, evidence, ruleset: Ruleset,
               concept_id: Optional[str] = None) -> float:
    prior, learn, slip, guess = bkt_params(ruleset, concept_id)
    bounds = ruleset.bkt["update_bounds"]
    # Accept either BKTEvidence dataclass or a plain string/s enum value
    if hasattr(evidence, "evidence"):
        ev = evidence.evidence
        weight = max(0.0, min(1.0, getattr(evidence, "weight", 1.0)))
    else:
        # Accept a string or enum value
        ev = evidence.value if hasattr(evidence, "value") else str(evidence)
        weight = 1.0
    if ev == "correct":
        num = p_known * (1 - slip)
        den = p_known * (1 - slip) + (1 - p_known) * guess
        posterior = num / den if den > 0 else p_known
    elif ev == "incorrect":
        num = p_known * slip
        den = p_known * slip + (1 - p_known) * (1 - guess)
        posterior = num / den if den > 0 else p_known
    elif ev == "partial":
        # Half way: treat as correct with 0.5 weight then apply learning.
        # Avoids a full incorrect drop for an answer that hit some expected concepts.
        num = p_known * (1 - slip)
        den = p_known * (1 - slip) + (1 - p_known) * guess
        posterior_correct = num / den if den > 0 else p_known
        posterior = p_known + (posterior_correct - p_known) * weight
    else:  # none
        posterior = p_known
    # learning transition
    posterior = posterior + (1 - posterior) * learn
    # weighting toward prior for partial / repeated-correct evidence
    posterior = p_known + (posterior - p_known) * (1.0 if ev in ("correct", "incorrect") else weight)
    # bounds
    posterior = max(bounds["min_p"], min(bounds["max_p"], posterior))
    return float(posterior)


def bkt_band(p_known: float, ruleset: Ruleset) -> str:
    th = ruleset.mastery["thresholds"]
    if p_known < th["unstarted_lo"]:
        return "unstarted"
    if p_known < th["novice_hi"]:
        return "novice"
    if p_known < th["developing_hi"]:
        return "developing"
    if p_known < th["proficient_hi"]:
        return "proficient"
    return "mastered"


def evidence_from_event(event_type: str, payload: dict, ruleset: Ruleset) -> BKTEvidence:
    """Map a learner event to BKT evidence using the ruleset's evidence rules."""
    rules = ruleset.bkt["evidence_rules"]
    rule = rules.get(event_type)
    if not rule:
        return BKTEvidence(evidence="none", weight=0.0)
    return BKTEvidence(
        evidence=rule["evidence"] or "none",
        weight=float(rule["weight"]),
    )


__all__ = ["BKTEvidence", "bkt_params", "bkt_update", "bkt_band", "evidence_from_event"]
