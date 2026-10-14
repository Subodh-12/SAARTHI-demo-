"""Persistence adapter — SQLAlchemy async engine + tiny migration runner.

Backend defaults to SQLite (`aiosqlite`); selecting `postgres` requires a
`postgres*` DATABASE_URL. The repository layer talks to repositories that
depend on the interface, never the driver directly.
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import AsyncIterator, Optional

from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, create_async_engine
from sqlalchemy.orm import sessionmaker

from ...core.logging import get_logger
from ...core.settings import get_settings

log = get_logger("saarthi.persistence")

SCHEMA_PATH = Path(__file__).parent / "schema.sql"


class Persistence:
    """Wraps a SQLAlchemy AsyncEngine + session factory.

    The class is the seam where we could swap to Postgres/MinIO/Redis without
    touching callers. Workers do not own durable state — all state lives here.
    """

    def __init__(self, engine: AsyncEngine, factory: "sessionmaker[AsyncSession]") -> None:
        self.engine = engine
        self.factory = factory

    @classmethod
    def from_settings(cls) -> "Persistence":
        s = get_settings()
        url = s.database_url
        engine = create_async_engine(
            url, echo=s.db_echo, pool_size=s.db_pool_size if "postgres" in url else 5,
            future=True,
        )
        factory = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
        return cls(engine, factory)

    async def apply_schema(self) -> None:
        """Apply schema.sql to the connected DB. Idempotent."""
        sql = SCHEMA_PATH.read_text(encoding="utf-8")
        # SQLite + async: use raw_connection for batch DDL.
        async with self.engine.begin() as conn:
            # split on semicolons (statements only, no procedures)
            for stmt in _split_statements(sql):
                stmt = stmt.strip()
                if not stmt:
                    continue
                await conn.exec_driver_sql(stmt) if hasattr(conn, "exec_driver_sql") else await conn.execute(_text(stmt))
        log.info("schema_applied path=%s", SCHEMA_PATH)

    @asynccontextmanager
    async def session(self) -> AsyncIterator[AsyncSession]:
        async with self.factory() as session:
            yield session

    async def dispose(self) -> None:
        await self.engine.dispose()


def _split_statements(sql: str) -> list[str]:
    """Naive SQL splitter — good enough for our DDL (no procedures)."""
    out: list[str] = []
    cur: list[str] = []
    for line in sql.splitlines():
        line = line.strip()
        if not line or line.startswith("--"):
            continue
        cur.append(line)
        if line.endswith(";"):
            out.append("\n".join(cur))
            cur = []
    if cur:
        out.append("\n".join(cur))
    return out


def _text(stmt: str):
    from sqlalchemy import text
    return text(stmt)


# --------------------------------------------------------------------------- #
# Lifecycle helpers
# --------------------------------------------------------------------------- #
_singleton: Optional[Persistence] = None


async def get_persistence() -> Persistence:
    global _singleton
    if _singleton is None:
        _singleton = Persistence.from_settings()
        await _singleton.apply_schema()
    return _singleton


async def dispose_persistence() -> None:
    global _singleton
    if _singleton is not None:
        await _singleton.dispose()
        _singleton = None


async def reset_persistence_for_tests() -> Persistence:
    """Test helper — recreates the schema from scratch on a fresh DB file."""
    global _singleton
    if _singleton is not None:
        await _singleton.dispose()
        _singleton = None
    s = get_settings()
    if s.persistence_backend == "sqlite":
        # wipe the DB file for a clean slate
        db_path = s.database_url.split("///")[-1]
        if db_path and db_path != ":memory:" and os.path.exists(db_path):
            os.remove(db_path)
    _singleton = Persistence.from_settings()
    await _singleton.apply_schema()
    return _singleton


__all__ = [
    "Persistence",
    "get_persistence",
    "dispose_persistence",
    "reset_persistence_for_tests",
    "SCHEMA_PATH",
]
