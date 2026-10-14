"""Learner state route — current mastery + active packs."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...domain.schemas import LearnerState
from ..middleware import require_device_auth

router = APIRouter(prefix="/state", tags=["state"])


@router.get("", response_model=LearnerState)
async def get_learner_state(
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    device_id, learner_id = ctx
    pack_repo = request.app.state.pack_repository
    mastery_repo = request.app.state.mastery_repository
    decision_repo = request.app.state.decision_repository

    mastery = await mastery_repo.get_mastery(learner_id)
    installed = await pack_repo.list_installed_packs(device_id)
    recent = await decision_repo.list_recent_decisions(learner_id, limit=1)
    last_decision_id = recent[0].decision_id if recent else None

    # Outbox depth = events pending for this device+learner (server-side,
    # not the client outbox — those are recorded when sync is called).
    outbox_depth = 0

    return LearnerState(
        learner_id=learner_id, device_id=device_id,
        mastery=mastery,
        active_pack_versions={pid: ver for pid, ver in installed},
        last_decision_id=last_decision_id, outbox_depth=outbox_depth,
    )


__all__ = ["router"]
