"""Pack loader — reads the built curriculum pack into runtime memory.

Loads `packs/pack_class9_science_or_v1-1.0.0.json` once, indexes it by
chunk_id / concept_id / question_id / chapter_id, and exposes lookup helpers.

The pack is content-only; it does not depend on the DB. The DB stores the
manifest and per-device installed-pack state.
"""
from __future__ import annotations

import functools
import json
import time
from pathlib import Path
from typing import Optional

from ..domain.schemas import (
    Chapter, Chunk, Concept, GlossaryEntry, PackManifest, Question,
)


class PackContentIndex:
    """In-memory index of a built curriculum pack."""

    def __init__(self, payload: dict) -> None:
        m = payload["manifest"]
        self.manifest = PackManifest(
            pack_id=m["pack_id"], version=m["version"],
            content_version=m["content_version"], language=m["language"],
            byte_size=m["byte_size"], checksum_sha256=m["checksum_sha256"],
            min_app_version=m["min_app_version"], licence=m["licence"],
            source_refs=m.get("source_refs", []),
            chapters=m["chapters"], created_at=m["created_at"],
        )
        self.chapters: dict[str, Chapter] = {
            c["chapter_id"]: Chapter(
                chapter_id=c["chapter_id"], subject=c.get("subject", "science"),
                grade=c.get("grade", "class9"), title_or=c["title_or"],
                title_en=c["title_en"], summary_or=c.get("summary_or", ""),
                source_refs=c.get("source_refs", []),
            ) for c in payload["chapters"]
        }
        self.concepts: dict[str, Concept] = {
            c["concept_id"]: Concept(
                concept_id=c["concept_id"], title_or=c["title_or"],
                title_en=c["title_en"], chapter_id=c["chapter_id"],
                prerequisites=c.get("prerequisites", []),
                summary_or=c.get("summary_or", ""),
                source_refs=c.get("source_refs", []),
            ) for c in payload["concepts"]
        }
        self.chunks: dict[str, Chunk] = {
            ch["chunk_id"]: Chunk(
                chunk_id=ch["chunk_id"], concept_id=ch["concept_id"],
                chapter_id=ch["chapter_id"], ordinal=ch["ordinal"],
                text_or=ch["text_or"], source_ref=ch["source_ref"],
                glossary_refs=ch.get("glossary_refs", []),
            ) for ch in payload["chunks"]
        }
        self.questions: dict[str, Question] = {
            q["question_id"]: Question(
                question_id=q["question_id"], concept_id=q["concept_id"],
                chapter_id=q.get("chapter_id", ""),
                qtype=q["qtype"], prompt_or=q["prompt_or"],
                options=q.get("options", []),
                correct_option=q.get("correct_option"),
                rubric_or=q.get("rubric_or"),
                expected_concepts=q.get("expected_concepts", []),
                explanation_or=q["explanation_or"],
                difficulty=q["difficulty"],
                misconception_tag=q.get("misconception_tag"),
                source_ref=q.get("source_ref", ""),
            ) for q in payload["questions"]
        }
        self.glossary: list[GlossaryEntry] = [
            GlossaryEntry(
                term_or=g["term_or"], term_en=g["term_en"],
                definition_or=g["definition_or"], definition_en=g["definition_en"],
            ) for g in payload["glossary"]
        ]
        self.glossary_by_en = {g.term_en: g for g in self.glossary}
        self.glossary_by_or = {g.term_or: g for g in self.glossary}
        # Per-chapter concept order (used by deterministic decision engine)
        self.concept_order: list[str] = [c["concept_id"] for c in payload["concepts"]]
        # Chapter-for-concept map (used by decide())
        self.chapter_for_concept: dict[str, str] = {
            c["concept_id"]: c["chapter_id"] for c in payload["concepts"]
        }
        # Prereq map
        self.prereqs: dict[str, list[str]] = {
            c["concept_id"]: c.get("prerequisites", []) for c in payload["concepts"]
        }

    def get_chunk(self, chunk_id: str) -> Optional[Chunk]:
        return self.chunks.get(chunk_id)

    def get_concept(self, concept_id: str) -> Optional[Concept]:
        return self.concepts.get(concept_id)

    def get_question(self, question_id: str) -> Optional[Question]:
        return self.questions.get(question_id)

    def get_chapter(self, chapter_id: str) -> Optional[Chapter]:
        return self.chapters.get(chapter_id)

    def list_questions_for_concept(self, concept_id: str, difficulty: Optional[str] = None) -> list[Question]:
        out = [q for q in self.questions.values() if q.concept_id == concept_id]
        if difficulty:
            out = [q for q in out if q.difficulty == difficulty]
        return out

    def list_chunks_for_concept(self, concept_id: str) -> list[Chunk]:
        return sorted(
            [c for c in self.chunks.values() if c.concept_id == concept_id],
            key=lambda c: c.ordinal,
        )


_PACK_CACHE: dict[str, PackContentIndex] = {}


def load_pack_index(pack_path: str | None = None) -> PackContentIndex:
    """Load (and cache) a built curriculum pack from disk."""
    path = Path(pack_path or "packs/pack_class9_science_or_v1-1.0.0.json")
    if str(path) in _PACK_CACHE:
        return _PACK_CACHE[str(path)]
    with open(path, "r", encoding="utf-8") as f:
        payload = json.load(f)
    idx = PackContentIndex(payload)
    _PACK_CACHE[str(path)] = idx
    return idx


def reset_pack_cache() -> None:
    _PACK_CACHE.clear()


__all__ = ["PackContentIndex", "load_pack_index", "reset_pack_cache"]
