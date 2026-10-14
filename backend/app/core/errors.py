"""Typed error model (RFC 7807 problem+json) for SAARTHI.

Every error response is a stable JSON object:
{
  "type": "https://saarthi.app/errors/<error_code>",
  "title": "<short human label, English>",
  "status": <http_status>,
  "detail": "<longer human explanation, English>",
  "error_code": "<stable snake_case code>",
  "request_id": "<correlation id>",
  "decision_id": "<optional, present for orchestration errors>"
  "instance": "<optional path>"
}

Stable error codes (subset; extend as needed). The frontend consumes only
`error_code` to localise strings — never `title`/`detail`.
"""
from __future__ import annotations

import enum
import logging
from typing import Optional

from fastapi import Request
from fastapi.encoders import jsonable_encoder
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

log = logging.getLogger("saarthi.errors")


class ErrorCode(str, enum.Enum):
    # Auth
    UNAUTHENTICATED = "unauthenticated"
    TOKEN_EXPIRED = "token_expired"
    TOKEN_INVALID = "token_invalid"
    FORBIDDEN = "forbidden"
    # Profile / device
    DEVICE_UNKNOWN = "device_unknown"
    LEARNER_NOT_FOUND = "learner_not_found"
    LEARNER_ALREADY_ACTIVE_ON_DEVICE = "learner_already_active_on_device"
    TOO_MANY_PROFILES_ON_DEVICE = "too_many_profiles_on_device"
    # Validation / contracts
    VALIDATION_ERROR = "validation_error"
    INVALID_REQUEST = "invalid_request"
    PACK_MANIFEST_INVALID = "pack_manifest_invalid"
    PACK_CHECKSUM_MISMATCH = "pack_checksum_mismatch"
    # Sync
    SYNC_BATCH_TOO_LARGE = "sync_batch_too_large"
    SYNC_EVENT_REJECTED = "sync_event_rejected"
    SYNC_ORDERING_CONFLICT = "sync_ordering_conflict"
    SYNC_MULTI_DEVICE_CONFLICT = "sync_multi_device_conflict"
    # Orchestration
    ORCHESTRATION_TIMEOUT = "orchestration_timeout"
    ORCHESTRATION_TOOL_NOT_ALLOWED = "orchestration_tool_not_allowed"
    ORCHESTRATION_VALIDATION_FAILED = "orchestration_validation_failed"
    # Provider adapters
    TRANSLATION_PROVIDER_UNAVAILABLE = "translation_provider_unavailable"
    GENERATION_PROVIDER_UNAVAILABLE = "generation_provider_unavailable"
    EMBEDDINGS_PROVIDER_UNAVAILABLE = "embeddings_provider_unavailable"
    RETRIEVAL_PROVIDER_UNAVAILABLE = "retrieval_provider_unavailable"
    # Resource / system
    NOT_FOUND = "not_found"
    RATE_LIMITED = "rate_limited"
    CONFLICT = "conflict"
    INTERNAL_ERROR = "internal_error"
    # Content
    CONTENT_OUT_OF_LESSONS = "content_out_of_lessons"


class Problem(BaseModel):
    """RFC 7807 problem+json with SAARTHI extensions."""
    type: str = Field(..., description="URI identifying the error type")
    title: str = Field(..., description="Short human label (English)")
    status: int = Field(..., description="HTTP status code")
    detail: str = Field("", description="Longer human explanation (English)")
    error_code: str = Field(..., description="Stable snake_case code")
    request_id: str = Field("", description="Correlation id")
    decision_id: Optional[str] = Field(None, description="Decision id, if applicable")
    instance: Optional[str] = Field(None, description="Request path")


class SaarthiError(Exception):
    """Domain exception carrying a stable ErrorCode and HTTP status."""

    def __init__(
        self,
        code: ErrorCode,
        *,
        status: int = 400,
        detail: str = "",
        title: Optional[str] = None,
        decision_id: Optional[str] = None,
        instance: Optional[str] = None,
    ) -> None:
        self.code = code
        self.status = status
        self.detail = detail
        self.title = title or code.value
        self.decision_id = decision_id
        self.instance = instance
        super().__init__(f"{code.value}: {detail}")


def _problem_from(code: ErrorCode, *, status: int, detail: str, title: str | None,
                  request_id: str, decision_id: str | None = None,
                  instance: str | None = None) -> Problem:
    return Problem(
        type=f"https://saarthi.app/errors/{code.value}",
        title=title or code.value,
        status=status,
        detail=detail,
        error_code=code.value,
        request_id=request_id,
        decision_id=decision_id,
        instance=instance,
    )


async def saarthi_exception_handler(request: Request, exc: SaarthiError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "")
    log.warning("saarthi_error code=%s status=%s detail=%s request_id=%s",
                exc.code.value, exc.status, exc.detail, request_id)
    problem = _problem_from(
        exc.code, status=exc.status, detail=exc.detail, title=exc.title,
        request_id=request_id, decision_id=exc.decision_id, instance=exc.instance,
    )
    return JSONResponse(
        status_code=exc.status,
        content=jsonable_encoder(problem),
        media_type="application/problem+json",
        headers={"X-Request-Id": request_id} if request_id else None,
    )


async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "")
    problem = _problem_from(
        ErrorCode.VALIDATION_ERROR, status=422,
        detail=f"Invalid request body/params: {exc.errors()!r}",
        title="Validation error",
        request_id=request_id,
    )
    return JSONResponse(
        status_code=422,
        content=jsonable_encoder(problem),
        media_type="application/problem+json",
        headers={"X-Request-Id": request_id} if request_id else None,
    )


async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    request_id = getattr(request.state, "request_id", "")
    log.exception("unhandled_exception request_id=%s msg=%s", request_id, exc)
    problem = _problem_from(
        ErrorCode.INTERNAL_ERROR, status=500,
        detail="Internal server error. Please try again.",
        title="Internal error",
        request_id=request_id,
    )
    return JSONResponse(
        status_code=500,
        content=jsonable_encoder(problem),
        media_type="application/problem+json",
        headers={"X-Request-Id": request_id} if request_id else None,
    )


__all__ = [
    "ErrorCode",
    "Problem",
    "SaarthiError",
    "saarthi_exception_handler",
    "validation_exception_handler",
    "unhandled_exception_handler",
]
