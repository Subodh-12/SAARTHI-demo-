"""Versioned ruleset loader.

The ruleset is the single source of truth for the deterministic learning
engine. Python and TypeScript consume the SAME JSON file via their
respective loaders; both expose the same `Ruleset` shape so shared test
vectors can be applied.
"""
from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from functools import lru_cache
from pathlib import Path
from typing import Any


@dataclass
class Ruleset:
    raw: dict[str, Any]
    ruleset_version: str
    bkt: dict
    mastery: dict
    actions: dict
    repetition_guard: dict
    target_selection: dict
    network: dict
    delivery: dict
    background_actions: dict
    retries: dict
    sync: dict
    pack: dict
    prefetch: dict
    orchestration: dict
    translation: dict
    retrieval: dict
    generation: dict
    validation: dict


def load_ruleset(path: str | os.PathLike | None = None) -> Ruleset:
    path = Path(path or os.environ.get("SAARTHI_RULESET_PATH", "packages/ruleset/rules.json"))
    with open(path, "r", encoding="utf-8") as f:
        raw = json.load(f)
    return Ruleset(
        raw=raw,
        ruleset_version=raw["ruleset_version"],
        bkt=raw["bkt"],
        mastery=raw["mastery"],
        actions=raw["actions"],
        repetition_guard=raw["repetition_guard"],
        target_selection=raw["target_selection"],
        network=raw["network"],
        delivery=raw["delivery"],
        background_actions=raw["background_actions"],
        retries=raw["retries"],
        sync=raw["sync"],
        pack=raw["pack"],
        prefetch=raw["prefetch"],
        orchestration=raw["orchestration"],
        translation=raw["translation"],
        retrieval=raw["retrieval"],
        generation=raw["generation"],
        validation=raw["validation"],
    )


@lru_cache(maxsize=4)
def get_ruleset(path: str | None = None) -> Ruleset:
    return load_ruleset(path)


def reset_ruleset_cache() -> None:
    get_ruleset.cache_clear()


def mastery_band(p: float, mastery: dict) -> str:
    th = mastery["thresholds"]
    if p < th["unstarted_lo"]:
        return "unstarted"
    if p < th["novice_hi"]:
        return "novice"
    if p < th["developing_hi"]:
        return "developing"
    if p < th["proficient_hi"]:
        return "proficient"
    return "mastered"


__all__ = ["Ruleset", "load_ruleset", "get_ruleset", "reset_ruleset_cache", "mastery_band"]
