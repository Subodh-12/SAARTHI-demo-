"""Routes aggregator."""
from . import (
    assessments, content, decisions, doubts, health, learners, packs, state, sync,
)
from fastapi import APIRouter

api_router = APIRouter(prefix="/api/v1")
api_router.include_router(health.router)
api_router.include_router(learners.router)
api_router.include_router(content.router)
api_router.include_router(assessments.router)
api_router.include_router(decisions.router)
api_router.include_router(doubts.router)
api_router.include_router(sync.router)
api_router.include_router(packs.router)
api_router.include_router(state.router)

__all__ = ["api_router"]
