"""Central typed settings for SAARTHI.

Reads from environment / `.env`. Validates required settings at startup.
Provides safe local defaults so the project runs without secrets.

Secrets are never exposed to the frontend — the API layer never serialises
this object wholesale; only a small, vetted subset is exposed via `/health`
and `/api/v1/diagnostics`.
"""
from __future__ import annotations

import os
from functools import lru_cache
from typing import Literal

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # ---- App ----
    app_name: str = "SAARTHI"
    app_version: str = "0.1.0"
    env: Literal["dev", "test", "prod"] = "dev"
    log_level: str = "INFO"
    api_prefix: str = "/api/v1"

    # ---- Network ----
    backend_host: str = "127.0.0.1"
    backend_port: int = 8000
    frontend_origin: str = "http://127.0.0.1:5173"
    cors_origins: str = "http://127.0.0.1:5173,http://localhost:5173"

    # ---- Persistence ----
    persistence_backend: Literal["sqlite", "postgres"] = "sqlite"
    database_url: str = "sqlite+aiosqlite:///./saarthi.db"
    db_pool_size: int = 5
    db_echo: bool = False

    # ---- Object storage ----
    object_storage_backend: Literal["local", "s3", "minio"] = "local"
    packs_dir: str = "packs"

    # ---- Ruleset ----
    ruleset_path: str = "packages/ruleset/rules.json"

    # ---- Translation ----
    translation_provider: Literal["mock", "disabled", "hf_local", "remote"] = "mock"
    hf_token: str = ""  # secret; never sent to browser
    hf_translation_model_en2indic: str = "ai4bharat/indictrans2-en-indic-dist-200M"
    hf_translation_model_indic2en: str = "ai4bharat/indictrans2-indic-en-dist-200M"
    translation_cache_ttl_seconds: int = 86400

    # ---- LLM generation ----
    llm_provider: Literal["mock", "openai", "anthropic"] = "mock"
    llm_api_key: str = ""  # secret
    llm_model: str = "gpt-4o-mini"
    llm_base_url: str = ""
    llm_timeout_seconds: float = 12.0

    # ---- Embeddings / Retrieval ----
    retrieval_provider: Literal["local_hybrid", "faiss_hybrid"] = "local_hybrid"
    embeddings_provider: Literal["mock", "hf", "openai"] = "mock"
    embeddings_model: str = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"

    # ---- Auth ----
    device_token_bytes: int = 32
    token_ttl_seconds: int = 7776000  # 90 days
    pin_hash_iterations: int = 100_000

    # ---- Rate limits / security ----
    rate_limit_per_minute: int = 120
    max_request_bytes: int = 262_144  # 256 KiB
    enable_secure_cookies: bool = False  # set True when behind HTTPS

    # ---- Feature flags ----
    enable_prefetch: bool = True
    enable_voice_asr: bool = False
    enable_voice_tts: bool = False
    enable_dev_trace: bool = True

    # ---- Determinism / tests ----
    random_seed: int = 42

    # ------------------------------------------------------------------
    # Validators
    # ------------------------------------------------------------------
    @field_validator("env")
    @classmethod
    def _env(cls, v: str) -> str:
        if v not in {"dev", "test", "prod"}:
            raise ValueError("env must be dev/test/prod")
        return v

    @field_validator("log_level")
    @classmethod
    def _log(cls, v: str) -> str:
        if v.upper() not in {"DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"}:
            raise ValueError("invalid log_level")
        return v.upper()

    @field_validator("database_url")
    @classmethod
    def _db_url(cls, v: str, info) -> str:
        if info.data.get("persistence_backend") == "postgres":
            if not v.startswith(("postgres://", "postgresql://", "postgres+asyncpg://")):
                raise ValueError("postgres backend requires a postgres* DATABASE_URL")
        return v

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------
    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]

    def has_secret(self, name: str) -> bool:
        """True if a secret env var has been set non-empty."""
        return bool(getattr(self, name, ""))

    def public_diagnostics(self) -> dict:
        """Subset safe to expose to the frontend via /diagnostics."""
        return {
            "app_name": self.app_name,
            "app_version": self.app_version,
            "env": self.env,
            "persistence_backend": self.persistence_backend,
            "translation_provider": self.translation_provider,
            "llm_provider": self.llm_provider,
            "retrieval_provider": self.retrieval_provider,
            "embeddings_provider": self.embeddings_provider,
            "enable_prefetch": self.enable_prefetch,
            "enable_voice_asr": self.enable_voice_asr,
            "enable_voice_tts": self.enable_voice_tts,
            "has_hf_token": self.has_secret("hf_token"),
            "has_llm_key": self.has_secret("llm_api_key"),
        }


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Cached settings accessor. Override `ENV`/vars before first call."""
    return Settings()


def reset_settings_cache() -> None:
    """Test helper: clear the cached settings so a new env takes effect."""
    get_settings.cache_clear()


__all__ = ["Settings", "get_settings", "reset_settings_cache"]
