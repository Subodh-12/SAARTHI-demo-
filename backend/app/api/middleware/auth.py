"""Auth middleware — device-bound token verification.

Extracts `Authorization: Bearer <token>`, calls `AuthService.verify_device_token`,
and sets `request.state.device_id` / `request.state.learner_id`. Raises
`SaarthiError(UNAUTHENTICATED)` on failure.
"""
from __future__ import annotations

from fastapi import Request, Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from ...core.errors import ErrorCode, SaarthiError
from ...services import AuthService

bearer_scheme = HTTPBearer(auto_error=False)


async def get_auth_service(request: Request) -> AuthService:
    """Build an AuthService from app-state repositories (set at startup)."""
    auth = getattr(request.app.state, "auth_service", None)
    if auth is None:
        raise SaarthiError(ErrorCode.INTERNAL_ERROR, status=500,
                           detail="auth service not initialised")
    return auth


async def require_device_auth(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
    auth: AuthService = Depends(get_auth_service),
) -> tuple[str, str]:
    """Return (device_id, learner_id). Raise 401 on missing/invalid token."""
    if creds is None or creds.scheme.lower() != "bearer" or not creds.credentials:
        raise SaarthiError(ErrorCode.UNAUTHENTICATED, status=401,
                           detail="missing Bearer token")
    try:
        device_id, learner_id = await auth.verify_device_token(creds.credentials)
    except PermissionError as e:
        raise SaarthiError(ErrorCode.TOKEN_INVALID, status=401, detail=str(e))
    request.state.device_id = device_id
    request.state.learner_id = learner_id
    return device_id, learner_id


__all__ = ["require_device_auth", "get_auth_service", "bearer_scheme"]
