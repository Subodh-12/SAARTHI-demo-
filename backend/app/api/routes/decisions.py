"""Decision routes — next-decision, get-by-id, trace."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request
from pydantic import BaseModel

from ...domain.schemas import Decision, DecisionTrace, NetworkState
from ..middleware import require_device_auth

router = APIRouter(prefix="/decisions", tags=["decisions"])


class NextDecisionRequest(BaseModel):
    network: NetworkState = NetworkState.ONLINE


@router.post("/next", response_model=Decision)
async def next_decision(
    body: NextDecisionRequest,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    _device_id, learner_id = ctx
    decision_svc = request.app.state.decision_service
    return await decision_svc.next_decision(
        learner_id=learner_id, env_network=body.network,
        produced_by="server_engine",
    )


@router.get("/{decision_id}", response_model=Decision)
async def get_decision(
    decision_id: str,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    decision_svc = request.app.state.decision_service
    d = await decision_svc.get_decision(decision_id)
    if not d:
        from ...core.errors import ErrorCode, SaarthiError
        raise SaarthiError(ErrorCode.NOT_FOUND, status=404,
                           detail=f"decision {decision_id} not found")
    return d


@router.get("/{decision_id}/trace", response_model=DecisionTrace)
async def get_decision_trace(
    decision_id: str,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    decision_svc = request.app.state.decision_service
    t = await decision_svc.get_trace(decision_id)
    if not t:
        from ...core.errors import ErrorCode, SaarthiError
        raise SaarthiError(ErrorCode.NOT_FOUND, status=404,
                           detail=f"trace for {decision_id} not found")
    return t


__all__ = ["router"]
