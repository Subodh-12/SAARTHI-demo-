"""Minimal OpenTelemetry-style tracing.

We emit spans as JSON to the logger `saarthi.trace`. Each span has a stable
set of fields (node/tool, provider, duration, status, version metadata,
redacted inputs/outputs). Real OpenTelemetry exporter can be plugged in by
configuring the OTLP handler — out of scope for the MVP env, but the span
data model is OTel-compatible (trace_id, span_id, parent_span_id).
"""
from __future__ import annotations

import contextvars
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from .logging import get_logger

_log = get_logger("saarthi.trace")

# Context: the current span id, propagated across the request lifecycle.
_current_span_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_span_id", default=None,
)
_current_trace_id: contextvars.ContextVar[Optional[str]] = contextvars.ContextVar(
    "current_trace_id", default=None,
)


def new_trace_id() -> str:
    return uuid.uuid4().hex


def new_span_id() -> str:
    return uuid.uuid4().hex[:16]


@dataclass
class Span:
    trace_id: str
    span_id: str
    parent_span_id: Optional[str]
    node: str
    tool: Optional[str] = None
    provider: Optional[str] = None
    start_ms: int = field(default_factory=lambda: int(time.time() * 1000))
    end_ms: Optional[int] = None
    duration_ms: Optional[int] = None
    status: str = "ok"
    error_code: Optional[str] = None
    ruleset_version: Optional[str] = None
    model_id: Optional[str] = None
    input_summary: dict[str, Any] = field(default_factory=dict)
    output_summary: dict[str, Any] = field(default_factory=dict)
    retry: Optional[int] = None
    fallback: Optional[str] = None

    def end(self, status: str = "ok", error_code: Optional[str] = None) -> None:
        self.end_ms = int(time.time() * 1000)
        self.duration_ms = self.end_ms - self.start_ms
        self.status = status
        self.error_code = error_code
        _log.info(
            "span",
            extra={
                "trace_id": self.trace_id,
                "span_id": self.span_id,
                "parent_span_id": self.parent_span_id,
                "node": self.node,
                "tool": self.tool,
                "provider": self.provider,
                "duration_ms": self.duration_ms,
                "status": self.status,
                "error_code": self.error_code,
                "ruleset_version": self.ruleset_version,
                "model_id": self.model_id,
                "retry": self.retry,
                "fallback": self.fallback,
                "input": self.input_summary,
                "output": self.output_summary,
            },
        )


class Tracer:
    """Lightweight tracer that emits spans to `saarthi.trace` logger."""

    def __init__(self, name: str) -> None:
        self.name = name

    def start_span(
        self,
        node: str,
        *,
        tool: Optional[str] = None,
        provider: Optional[str] = None,
        ruleset_version: Optional[str] = None,
        model_id: Optional[str] = None,
        input_summary: Optional[dict] = None,
    ) -> Span:
        trace_id = _current_trace_id.get() or new_trace_id()
        if _current_trace_id.get() is None:
            _current_trace_id.set(trace_id)
        parent = _current_span_id.get()
        span = Span(
            trace_id=trace_id, span_id=new_span_id(), parent_span_id=parent,
            node=node, tool=tool, provider=provider,
            ruleset_version=ruleset_version, model_id=model_id,
            input_summary=input_summary or {},
        )
        _current_span_id.set(span.span_id)
        return span

    def end_span(
        self, span: Span, *,
        status: str = "ok", error_code: Optional[str] = None,
        output_summary: Optional[dict] = None,
    ) -> Span:
        span.output_summary = output_summary or {}
        span.end(status=status, error_code=error_code)
        # restore parent
        _current_span_id.set(span.parent_span_id)
        return span


def bind_request_trace() -> str:
    """Set a fresh trace_id at request entry; return it for use in logs/responses."""
    trace_id = new_trace_id()
    _current_trace_id.set(trace_id)
    _current_span_id.set(None)
    return trace_id


def current_trace_id() -> Optional[str]:
    return _current_trace_id.get()


__all__ = ["Tracer", "Span", "bind_request_trace", "current_trace_id"]
