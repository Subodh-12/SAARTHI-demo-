"""Health, readiness, diagnostics, metrics."""
from __future__ import annotations

from fastapi import APIRouter, Request
from fastapi.responses import PlainTextResponse

from ...core.metrics import get_registry
from ...core.settings import get_settings
from ...domain.ruleset import get_ruleset
from ...adapters.ai.generation import get_generation_provider
from ...adapters.ai.retrieval import get_retrieval_provider
from ...adapters.ai.translation import get_translation_provider
from ...domain.schemas import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health(request: Request):
    s = get_settings()
    request_id = getattr(request.state, "request_id", "")
    return HealthResponse(
        status="ok", project="SAARTHI", app_version=s.app_version, env=s.env,
        persistence=s.persistence_backend, translation_provider=s.translation_provider,
        llm_provider=s.llm_provider, retrieval_provider=s.retrieval_provider,
        ruleset_version=get_ruleset().ruleset_version,
        has_hf_token=s.has_secret("hf_token"), has_llm_key=s.has_secret("llm_api_key"),
        request_id=request_id,
    )


@router.get("/readiness")
async def readiness():
    """Liveness ≠ readiness: model unavailability does not make the local
    decision engine unusable. Readiness reports provider health separately.
    """
    t = get_translation_provider()
    g = get_generation_provider()
    r = get_retrieval_provider()
    th = await t.health() if hasattr(t, "health") else {}
    gh = await g.health() if hasattr(g, "health") else {}
    rh = await r.health() if hasattr(r, "health") else {}
    return {
        "status": "ready" if True else "degraded",
        "translation": th,
        "generation": gh,
        "retrieval": rh,
        "core_decision_engine": "ready",  # always ready — pure functions
    }


@router.get("/diagnostics")
async def diagnostics():
    s = get_settings()
    return s.public_diagnostics()


@router.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return get_registry().export()


__all__ = ["router"]
