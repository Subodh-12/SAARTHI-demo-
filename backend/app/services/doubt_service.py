"""Doubt service — entry point for the doubt branch.

Wraps the orchestration graph and persists a decision/trace.
"""
from __future__ import annotations

from typing import Optional

from ..content.pack_loader import PackContentIndex
from ..domain.schemas import DecisionTrace, DoubtRequest, DoubtResponse
from ..orchestration.graph import OrchestrationState, run_doubt
from ..repositories import DecisionRepository


class DoubtService:
    def __init__(self, pack: PackContentIndex,
                 decisions: DecisionRepository) -> None:
        self.pack = pack
        self.decisions = decisions

    async def ask(self, req: DoubtRequest) -> DoubtResponse:
        return await run_doubt(req)
