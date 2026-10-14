"""Structured JSON logging for SAARTHI.

Logs are JSON objects with stable keys. Learner text, tokens, secrets and
PII are redacted by `_redact_value` / `RedactingFilter`.

Logs are English-only; learner-facing messages live in the Odia dictionary.
"""
from __future__ import annotations

import json
import logging
import re
import time
from typing import Any, Mapping

# Keys whose values should be redacted from logs.
_REDACTED_KEYS = {
    "token", "device_token", "auth", "authorization",
    "password", "pin", "pin_hash", "secret",
    "hf_token", "llm_api_key", "api_key",
    "phone", "phone_number", "email", "geolocation", "lat", "lng",
}
# Learner-text fields that may carry user input — truncate & redact to a hint.
_LEARNER_TEXT_KEYS = {"query", "answer", "answer_text", "user_text", "learner_text"}
# Patterns that match common secrets.
_SECRET_PATTERNS = [re.compile(r"(?i)bearer\s+[A-Za-z0-9._\-]{16,}"),
                    re.compile(r"(?i)sk-[A-Za-z0-9]{16,}")]


def _redact_value(key: str, value: Any) -> Any:
    if value is None:
        return None
    if key.lower() in _REDACTED_KEYS:
        return "<redacted>"
    if key.lower() in _LEARNER_TEXT_KEYS and isinstance(value, str):
        return f"<learner_text len={len(value)} hash={hash(value) & 0xFFFF:04x}>"
    if isinstance(value, str):
        for pat in _SECRET_PATTERNS:
            if pat.search(value):
                return "<redacted>"
    if isinstance(value, Mapping):
        return {k: _redact_value(k, v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_redact_value("item", v) for v in value][:50]
    return value


class RedactingFilter(logging.Filter):
    """Filter that redacts sensitive fields from log records."""

    def filter(self, record: logging.LogRecord) -> bool:  # noqa: A003
        # Redact `extra` payload on records emitted via `logger.info(..., extra={...})`.
        for attr in list(vars(record).keys()):
            if attr.startswith("_"):
                continue
            val = getattr(record, attr, None)
            if attr.lower() in _REDACTED_KEYS:
                setattr(record, attr, "<redacted>")
            elif isinstance(val, str) and any(p.search(val) for p in _SECRET_PATTERNS):
                setattr(record, attr, "<redacted>")
        return True


class JsonFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload: dict[str, Any] = {
            "ts": int(time.time() * 1000),
            "level": record.levelname,
            "logger": record.name,
            "msg": record.getMessage(),
        }
        for attr in ("request_id", "learner_id", "device_id", "decision_id",
                     "node", "tool", "provider", "duration_ms", "error_code",
                     "fallback", "ruleset_version", "model_id", "retry"):
            v = getattr(record, attr, None)
            if v is not None and v != "":
                payload[attr] = _redact_value(attr, v)
        # Include any other `extra` keys the caller passed.
        std = set(vars(logging.LogRecord(
            name="x", level=logging.INFO, pathname="", lineno=0,
            msg="", args=None, exc_info=None,
        )).keys()) | {"message", "asctime"}
        for attr, val in vars(record).items():
            if attr in std or attr in payload or attr.startswith("_"):
                continue
            payload[attr] = _redact_value(attr, val)
        if record.exc_info:
            payload["exc"] = self.formatException(record.exc_info)
        return json.dumps(payload, ensure_ascii=False)


def configure_logging(level: str = "INFO") -> None:
    root = logging.getLogger()
    # Don't double-attach handlers on reload.
    if not getattr(root, "_saarthi_configured", False):
        handler = logging.StreamHandler()
        handler.setFormatter(JsonFormatter())
        handler.addFilter(RedactingFilter())
        root.handlers = [handler]
        root.setLevel(level.upper())
        root._saarthi_configured = True
    else:
        root.setLevel(level.upper())


def get_logger(name: str) -> logging.Logger:
    return logging.getLogger(name)


__all__ = ["configure_logging", "get_logger", "JsonFormatter", "RedactingFilter"]
