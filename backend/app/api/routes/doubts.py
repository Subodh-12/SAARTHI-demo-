"""Doubt routes — POST /doubts/query."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...domain.schemas import DoubtRequest, DoubtResponse
from ..middleware import require_device_auth

router = APIRouter(prefix="/doubts", tags=["doubts"])


@router.post("/query", response_model=DoubtResponse)
async def query_doubt(
    body: DoubtRequest,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    # Force the learner_id from auth (don't trust the body).
    _device_id, learner_id = ctx
    body.learner_id = learner_id  # type: ignore[assignment]
    doubt_svc = request.app.state.doubt_service
    return await doubt_svc.ask(body)


__all__ = ["router"]
