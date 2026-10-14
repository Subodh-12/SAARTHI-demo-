"""Request middleware — assigns/propagates request_id, basic metrics."""
from __future__ import annotations

import time

from fastapi import Request
from starlette.middleware.base import BaseHTTPMiddleware, RequestResponseEndpoint
from starlette.responses import Response

from ...core.metrics import get_registry
from ...core.tracing import bind_request_trace


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: RequestResponseEndpoint) -> Response:
        request_id = request.headers.get("X-Request-Id") or bind_request_trace()
        request.state.request_id = request_id
        start = time.perf_counter()
        try:
            response = await call_next(request)
        except Exception:
            duration = (time.perf_counter() - start) * 1000
            get_registry().api_latency.observe(duration)
            get_registry().api_errors.inc(error_code="internal_error")
            raise
        duration = (time.perf_counter() - start) * 1000
        get_registry().api_latency.observe(duration)
        if response.status_code >= 400:
            get_registry().api_errors.inc(error_code=f"http_{response.status_code}")
        response.headers["X-Request-Id"] = request_id
        return response


__all__ = ["RequestIdMiddleware"]
