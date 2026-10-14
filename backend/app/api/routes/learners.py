"""Learner routes — profile create / get / list / activate."""
from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from ...core.errors import ErrorCode, SaarthiError
from ...domain.schemas import new_device_id
from ...domain.schemas import (
    AuthResponse, LearnerProfile, LearnerProfileCreate,
)
from ..middleware import get_auth_service, require_device_auth
from ...services import AuthService

router = APIRouter(prefix="/learners", tags=["learners"])


@router.post("", response_model=AuthResponse)
async def create_learner(
    body: LearnerProfileCreate,
    request: Request,
    auth: AuthService = Depends(get_auth_service),
):
    device_id = request.headers.get("X-Device-Id") or ""
    if not device_id:
        # Auto-register a new device for low-friction onboarding.
        device_id = new_device_id()
        await auth.register_device(device_id)
    return await auth.create_learner(device_id, body)


@router.get("/me", response_model=LearnerProfile)
async def get_current_learner(
    ctx: tuple[str, str] = Depends(require_device_auth),
    auth: AuthService = Depends(get_auth_service),
):
    _device_id, learner_id = ctx
    p = await auth.learners.get_learner(learner_id)
    if not p:
        raise SaarthiError(ErrorCode.LEARNER_NOT_FOUND, status=404,
                           detail=f"learner {learner_id} not found")
    return p


@router.post("/{learner_id}/activate", response_model=AuthResponse)
async def activate_learner(
    learner_id: str,
    request: Request,
    auth: AuthService = Depends(get_auth_service),
):
    device_id = request.headers.get("X-Device-Id") or ""
    if not device_id:
        raise SaarthiError(ErrorCode.DEVICE_UNKNOWN, status=400,
                           detail="X-Device-Id header required")
    return await auth.activate(learner_id, device_id)


@router.post("/auth/renew", response_model=AuthResponse)
async def renew_token(
    ctx: tuple[str, str] = Depends(require_device_auth),
    auth: AuthService = Depends(get_auth_service),
):
    device_id, _learner_id = ctx
    return await auth.renew_token(device_id)


__all__ = ["router"]
