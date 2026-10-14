"""Sync route — POST /sync."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...domain.schemas import SyncRequest, SyncResponse
from ..middleware import require_device_auth

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("", response_model=SyncResponse)
async def sync(
    body: SyncRequest,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    device_id, learner_id = ctx
    # Override the request's device/learner ids with the auth-resolved ones
    # to prevent privilege escalation.
    body.device_id = device_id  # type: ignore[assignment]
    body.learner_id = learner_id  # type: ignore[assignment]
    sync_svc = request.app.state.sync_service
    return await sync_svc.sync(body)


__all__ = ["router"]
