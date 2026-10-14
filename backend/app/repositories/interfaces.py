"""Repository interfaces — abstract base classes.

Concrete adapters live in `adapters/persistence/`. The API/services layer
depends only on these interfaces, never on SQLAlchemy or the driver.
"""
from __future__ import annotations

import abc
from typing import Optional

from ..domain.schemas import (
    Decision, DecisionTrace, LearnerEvent, LearnerProfile, MasteryRecord,
    Outcome, PerEventResult, PackManifest,
)


class LearnerRepository(abc.ABC):
    @abc.abstractmethod
    async def create_learner(self, profile: LearnerProfile, device_id: str) -> None: ...

    @abc.abstractmethod
    async def get_learner(self, learner_id: str) -> Optional[LearnerProfile]: ...

    @abc.abstractmethod
    async def list_learners_on_device(self, device_id: str) -> list[LearnerProfile]: ...

    @abc.abstractmethod
    async def activate_learner_on_device(self, learner_id: str, device_id: str) -> None: ...

    @abc.abstractmethod
    async def deactivate_learner_on_device(self, device_id: str) -> Optional[str]: ...

    @abc.abstractmethod
    async def get_active_learner_on_device(self, device_id: str) -> Optional[LearnerProfile]: ...


class DeviceRepository(abc.ABC):
    @abc.abstractmethod
    async def register_device(self, device_id: str, hardware_label: str) -> None: ...

    @abc.abstractmethod
    async def issue_token(self, device_id: str, token_hash: str, issued_at: int,
                          expires_at: int) -> None: ...

    @abc.abstractmethod
    async def verify_token(self, token_hash: str) -> Optional[tuple[str, int]]: ...
    """Return (device_id, expires_at) if the token is valid and not revoked."""

    @abc.abstractmethod
    async def revoke_tokens(self, device_id: str) -> None: ...


class EventRepository(abc.ABC):
    @abc.abstractmethod
    async def insert_event(self, ev: LearnerEvent) -> PerEventResult: ...
    """Idempotent insert; returns ACCEPTED on first insert, DUPLICATE on repeats."""

    @abc.abstractmethod
    async def list_events(self, learner_id: str, since_seq: int = 0,
                          limit: int = 1000) -> list[LearnerEvent]: ...

    @abc.abstractmethod
    async def get_sync_cursor(self, device_id: str, learner_id: str) -> tuple[int, int]: ...
    """Return (last_acked_seq, last_server_seq)."""

    @abc.abstractmethod
    async def bump_sync_cursor(self, device_id: str, learner_id: str,
                               last_acked_seq: int, last_server_seq: int) -> None: ...

    @abc.abstractmethod
    async def move_to_dead_letter(self, ev: LearnerEvent, reason: str,
                                  error_code: str) -> None: ...


class MasteryRepository(abc.ABC):
    @abc.abstractmethod
    async def get_mastery(self, learner_id: str) -> list[MasteryRecord]: ...

    @abc.abstractmethod
    async def upsert_mastery(self, learner_id: str, concept_id: str,
                             p_known: float, band: str, attempts: int,
                             correct: int, last_updated_event_seq: int) -> None: ...

    @abc.abstractmethod
    async def replace_mastery_snapshot(self, learner_id: str,
                                        snapshot: list[MasteryRecord]) -> None: ...


class DecisionRepository(abc.ABC):
    @abc.abstractmethod
    async def save_decision(self, decision: Decision) -> None: ...

    @abc.abstractmethod
    async def save_trace(self, decision_id: str, trace: DecisionTrace) -> None: ...

    @abc.abstractmethod
    async def get_decision(self, decision_id: str) -> Optional[Decision]: ...

    @abc.abstractmethod
    async def get_trace(self, decision_id: str) -> Optional[DecisionTrace]: ...

    @abc.abstractmethod
    async def list_recent_decisions(self, learner_id: str, limit: int = 10) -> list[Decision]: ...


class PackRepository(abc.ABC):
    @abc.abstractmethod
    async def upsert_pack_manifest(self, manifest: PackManifest) -> None: ...

    @abc.abstractmethod
    async def list_pack_manifests(self) -> list[PackManifest]: ...

    @abc.abstractmethod
    async def get_pack_manifest(self, pack_id: str, version: str) -> Optional[PackManifest]: ...

    @abc.abstractmethod
    async def record_installed_pack(self, device_id: str, pack_id: str, version: str,
                                    byte_size: int, checksum: str) -> None: ...

    @abc.abstractmethod
    async def list_installed_packs(self, device_id: str) -> list[tuple[str, str]]: ...


__all__ = [
    "LearnerRepository", "DeviceRepository", "EventRepository",
    "MasteryRepository", "DecisionRepository", "PackRepository",
]
