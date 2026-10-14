"""SAARTHI FastAPI app — entry point.

Wires:
- Settings + logging
- Persistence (SQLite/Postgres) with schema apply on startup
- Repository implementations
- Service layer (auth, assessment, decision, doubt, sync)
- Pack loader (in-memory curriculum index)
- API routes (versioned /api/v1)
- Middleware (request_id, error handlers)
- CORS from settings
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware

from .api.routes import api_router
from .api.middleware import RequestIdMiddleware
from .adapters.ai.generation import get_generation_provider
from .adapters.ai.retrieval import get_retrieval_provider
from .adapters.ai.translation import get_translation_provider
from .adapters.persistence import dispose_persistence, get_persistence
from .adapters.persistence.repositories import (
    SqlDecisionRepository, SqlDeviceRepository, SqlEventRepository,
    SqlLearnerRepository, SqlMasteryRepository, SqlPackRepository,
)
from .content.pack_loader import load_pack_index
from .core.errors import (
    SaarthiError, saarthi_exception_handler, unhandled_exception_handler,
    validation_exception_handler,
)
from .core.logging import configure_logging, get_logger
from .core.settings import get_settings
from .services import (
    AssessmentService, AuthService, DecisionService, DoubtService, SyncService,
)


@asynccontextmanager
async def lifespan(app: FastAPI):
    s = get_settings()
    configure_logging(s.log_level)
    log = get_logger("saarthi.main")
    log.info("startup env=%s persistence=%s", s.env, s.persistence_backend)
    # Persistence
    p = await get_persistence()
    # Seed pack manifest into DB if not present
    pack = load_pack_index()
    pack_repo = SqlPackRepository(p)
    await pack_repo.upsert_pack_manifest(pack.manifest)
    # Build services
    learners = SqlLearnerRepository(p)
    devices = SqlDeviceRepository(p)
    events = SqlEventRepository(p)
    mastery = SqlMasteryRepository(p)
    decisions = SqlDecisionRepository(p)
    app.state.persistence = p
    app.state.pack_index = pack
    app.state.auth_service = AuthService(learners, devices)
    app.state.assessment_service = AssessmentService(pack, events, mastery)
    app.state.decision_service = DecisionService(pack, mastery, decisions)
    app.state.doubt_service = DoubtService(pack, decisions)
    app.state.sync_service = SyncService(events, mastery, decisions)
    app.state.pack_repository = pack_repo
    app.state.mastery_repository = mastery
    app.state.decision_repository = decisions
    app.state.event_repository = events
    app.state.learner_repository = learners
    app.state.device_repository = devices
    log.info("ready")
    yield
    log.info("shutdown")
    await dispose_persistence()


def create_app() -> FastAPI:
    s = get_settings()
    app = FastAPI(
        title="SAARTHI API",
        description="Offline-first, Odia-first adaptive learning companion",
        version=s.app_version,
        lifespan=lifespan,
    )
    # CORS from settings
    app.add_middleware(
        CORSMiddleware,
        allow_origins=s.cors_origin_list,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["*"],
    )
    app.add_middleware(RequestIdMiddleware)
    # Error handlers
    app.add_exception_handler(SaarthiError, saarthi_exception_handler)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)
    app.add_exception_handler(Exception, unhandled_exception_handler)
    # Routes
    app.include_router(api_router)
    # Root + legacy lesson endpoint
    @app.get("/")
    def home():
        return {"message": "Welcome to SAARTHI", "status": "running",
                "version": s.app_version, "docs": "/docs"}

    @app.get("/api/lesson")
    def legacy_lesson():
        """Backwards-compat endpoint — returns the first chunk as a sample lesson."""
        pack = load_pack_index()
        if not pack.chunks:
            return {"id": "", "title": "No content", "subtitle": "",
                    "question": "", "options": [], "correct_option": 0,
                    "explanation": ""}
        ch = next(iter(pack.chunks.values()))
        q = next(iter(pack.questions.values()))
        return {
            "id": ch.chunk_id,
            "title": pack.chapters.get(ch.chapter_id, "").title_or if pack.chapters.get(ch.chapter_id) else "",
            "subtitle": ch.text_or[:80] + "…",
            "question": q.prompt_or,
            "options": q.options if q.qtype == "mcq" else [],
            "correct_option": q.correct_option or 0,
            "explanation": q.explanation_or,
        }

    return app


app = create_app()

__all__ = ["app", "create_app"]
