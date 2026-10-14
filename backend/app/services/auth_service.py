"""Auth service — device-bound tokens, no passwords, no PII."""
from __future__ import annotations

import hashlib
import secrets
import time

from ..core.settings import get_settings
from ..domain.schemas import (
    AuthResponse, LearnerProfile, LearnerProfileCreate, new_learner_id,
)
from ..repositories import (
    DeviceRepository, LearnerRepository,
)


class AuthService:
    def __init__(self, learners: LearnerRepository, devices: DeviceRepository) -> None:
        self.learners = learners
        self.devices = devices
        self.s = get_settings()

    async def register_device(self, device_id: str, hardware_label: str = "shared-android-low-end") -> None:
        await self.devices.register_device(device_id, hardware_label)

    async def create_learner(self, device_id: str, create: LearnerProfileCreate) -> AuthResponse:
        learner_id = new_learner_id()
        now_ms = int(time.time() * 1000)
        profile = LearnerProfile(
            learner_id=learner_id,
            display_label=create.display_label,
            locale=create.locale, grade=create.grade, subject=create.subject,
            pin_hash=create.pin_hash, created_at=now_ms,
        )
        await self.learners.create_learner(profile, device_id)
        await self.learners.activate_learner_on_device(learner_id, device_id)
        token = await self._issue_token(device_id)
        return AuthResponse(
            learner_id=learner_id, device_id=device_id,
            device_token=token, token_expires_at=now_ms + self.s.token_ttl_seconds * 1000,
        )

    async def activate(self, learner_id: str, device_id: str) -> AuthResponse:
        profile = await self.learners.get_learner(learner_id)
        if not profile:
            raise ValueError(f"unknown learner: {learner_id}")
        await self.learners.activate_learner_on_device(learner_id, device_id)
        token = await self._issue_token(device_id)
        now_ms = int(time.time() * 1000)
        return AuthResponse(
            learner_id=learner_id, device_id=device_id, device_token=token,
            token_expires_at=now_ms + self.s.token_ttl_seconds * 1000,
        )

    async def renew_token(self, device_id: str) -> AuthResponse:
        # Requires a valid (but possibly near-expiry) token; the route enforces that.
        active = await self.learners.get_active_learner_on_device(device_id)
        if not active:
            raise ValueError(f"no active learner on device {device_id}")
        token = await self._issue_token(device_id)
        now_ms = int(time.time() * 1000)
        return AuthResponse(
            learner_id=active.learner_id, device_id=device_id, device_token=token,
            token_expires_at=now_ms + self.s.token_ttl_seconds * 1000,
        )

    async def verify_device_token(self, token: str) -> tuple[str, str]:
        """Return (device_id, learner_id) for a valid token, raise otherwise."""
        token_hash = self._hash_token(token)
        info = await self.devices.verify_token(token_hash)
        if not info:
            raise PermissionError("invalid or expired token")
        device_id, _exp = info
        active = await self.learners.get_active_learner_on_device(device_id)
        if not active:
            raise PermissionError(f"no active learner on device {device_id}")
        return device_id, active.learner_id

    async def _issue_token(self, device_id: str) -> str:
        token = secrets.token_urlsafe(self.s.device_token_bytes)
        token_hash = self._hash_token(token)
        now_ms = int(time.time() * 1000)
        await self.devices.issue_token(device_id, token_hash, now_ms,
                                        now_ms + self.s.token_ttl_seconds * 1000)
        return token

    def _hash_token(self, token: str) -> str:
        return hashlib.sha256(token.encode("utf-8")).hexdigest()
