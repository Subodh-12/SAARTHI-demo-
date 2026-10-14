"""Assessment routes."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...core.errors import ErrorCode, SaarthiError
from ...domain.schemas import AssessmentResult, AssessmentSubmission
from ..middleware import require_device_auth

router = APIRouter(prefix="/assessments", tags=["assessments"])


@router.post("", response_model=AssessmentResult)
async def submit_assessment(
    body: AssessmentSubmission,
    request: Request,
    ctx: tuple[str, str] = Depends(require_device_auth),
):
    device_id, learner_id = ctx
    seq = int(request.headers.get("X-Event-Seq") or "1")
    assessment_svc = request.app.state.assessment_service
    result = await assessment_svc.submit_assessment(
        learner_id=learner_id, device_id=device_id, sub=body, seq=seq)
    # Compute next decision and fill in next_decision_id
    decision_svc = request.app.state.decision_service
    from ...domain.schemas import NetworkState
    decision = await decision_svc.next_decision(
        learner_id=learner_id, env_network=NetworkState.ONLINE,
        produced_by="server_engine",
        trigger_event_type="mcq_answered",
        trigger_concept_id=result.concept_id,
        trigger_evidence=result.evidence.value,
    )
    result.next_decision_id = decision.decision_id
    return result


__all__ = ["router"]
