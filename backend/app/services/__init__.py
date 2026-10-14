"""Use-case services — thin orchestrators over repositories + adapters.

Services are the only place where business logic meets I/O. They depend on
repository interfaces and adapter interfaces, never on FastAPI request objects.
"""
from __future__ import annotations

from .auth_service import AuthService
from .assessment_service import AssessmentService
from .decision_service import DecisionService
from .sync_service import SyncService
from .doubt_service import DoubtService

__all__ = [
    "AuthService", "AssessmentService", "DecisionService", "SyncService", "DoubtService",
]
