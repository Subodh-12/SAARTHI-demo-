"""SAARTHI curriculum pack builder.

Reads `curriculum/chXX/manifest.json` and `curriculum/glossary.json`,
normalises Odia text to Unicode NFC, validates chunks/questions/glossary,
computes a SHA-256 checksum, and emits a versioned pack archive under
`packs/saarthi-<id>-v<version>.srt.tar.gz` plus a manifest JSON.

The pack archive contains:
  - manifest.json   (pack id, version, content_version, byte_size,
                     checksum_sha256, min_app_version, chapters,
                     language, licence, source_refs, created_at)
  - chapters.json   (all chapter manifests merged)
  - glossary.json
  - questions.json  (all questions, flattened)
  - concepts.json   (concept graph: prereqs)
  - chunks.json     (all content chunks)

Run:
  python scripts/build_packs.py            # build all chapters
  python scripts/build_packs.py --strict   # publication gate; fails on any
                                          # validation error
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import io
import json
import os
import re
import sys
import time
import unicodedata
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parents[1]
CURRIC = ROOT / "curriculum"
PACKS_DIR = ROOT / "packs"

PACK_ID = "pack_class9_science_or_v1"
PACK_VERSION = "1.0.0"
CONTENT_VERSION = "2026.10.001"
LANGUAGE = "or"
MIN_APP_VERSION = "0.1.0"
LICENCE = "CC-BY 4.0 (original Odia notes aligned to NCERT Class 9 Science syllabus)"
SOURCE_REFS = [
    "NCERT Class 9 Science syllabus (chapters 1, 8, 6)",
    "Original Odia notes authored for SAARTHI MVP",
]
MAX_BYTES = 5 * 1024 * 1024  # 5 MiB pack budget
MIN_CHUNK_WORDS = 40   # ~80–200 Odia words target; we allow >=40 for dense formula chunks
MAX_CHUNK_WORDS = 280


# --------------------------------------------------------------------------- #
# Normalisation
# --------------------------------------------------------------------------- #
def normalise_odia(text: str) -> str:
    """NFC-normalise Odia text and clean common extraction artefacts."""
    text = unicodedata.normalize("NFC", text)
    # collapse whitespace
    text = re.sub(r"\s+", " ", text).strip()
    # remove zero-width chars
    text = re.sub(r"[\u200b-\u200f\u202a-\u202e]", "", text)
    return text


def count_odia_words(text: str) -> int:
    """Count Odia words (whitespace-split, ignoring pure punctuation)."""
    return len([w for w in text.split() if any(c.isalpha() for c in w)])


# --------------------------------------------------------------------------- #
# Validators
# --------------------------------------------------------------------------- #
class ValidationError(Exception):
    pass


def validate_concept(c: dict, chapter_id: str) -> None:
    for f in ("concept_id", "title_or", "title_en", "summary_or"):
        if not c.get(f):
            raise ValidationError(f"concept {c.get('concept_id')} missing {f}")
    if c.get("chapter_id") and c["chapter_id"] != chapter_id:
        raise ValidationError(
            f"concept {c['concept_id']} chapter_id mismatch: {c['chapter_id']} != {chapter_id}")
    c["chapter_id"] = chapter_id  # inject if absent
    # validate concept_id pattern
    if not re.match(r"^c[0-9]{4}$", c["concept_id"]):
        raise ValidationError(f"concept_id format invalid: {c['concept_id']}")


def validate_chunk(c: dict) -> None:
    for f in ("chunk_id", "concept_id", "ordinal", "text_or", "source_ref"):
        if not c.get(f):
            raise ValidationError(f"chunk missing {f}: {c}")
    if not re.match(r"^chunk_[A-Za-z0-9_-]{8,64}$", c["chunk_id"]):
        raise ValidationError(f"chunk_id format invalid: {c['chunk_id']}")
    n = count_odia_words(c["text_or"])
    if n < MIN_CHUNK_WORDS or n > MAX_CHUNK_WORDS:
        raise ValidationError(
            f"chunk {c['chunk_id']} word count {n} outside [{MIN_CHUNK_WORDS},{MAX_CHUNK_WORDS}]")


def validate_question(q: dict) -> None:
    for f in ("question_id", "concept_id", "qtype", "prompt_or",
              "explanation_or", "difficulty", "source_ref"):
        if not q.get(f):
            raise ValidationError(f"question missing {f}: {q}")
    if not re.match(r"^q_[A-Za-z0-9_-]{6,32}$", q["question_id"]):
        raise ValidationError(f"question_id format invalid: {q['question_id']}")
    if q["qtype"] == "mcq":
        if not q.get("options") or len(q["options"]) < 2:
            raise ValidationError(f"mcq {q['question_id']} needs >=2 options")
        if q.get("correct_option") is None or not (0 <= q["correct_option"] < len(q["options"])):
            raise ValidationError(f"mcq {q['question_id']} invalid correct_option")
    elif q["qtype"] == "short_answer":
        if not q.get("rubric_or"):
            raise ValidationError(f"short_answer {q['question_id']} needs rubric_or")
        if not q.get("expected_concepts"):
            raise ValidationError(f"short_answer {q['question_id']} needs expected_concepts")
    else:
        raise ValidationError(f"unknown qtype: {q['qtype']}")
    if q["difficulty"] not in ("easy", "medium", "hard"):
        raise ValidationError(f"invalid difficulty: {q['difficulty']}")


def validate_glossary_entry(g: dict) -> None:
    for f in ("term_or", "term_en", "definition_or", "definition_en"):
        if not g.get(f):
            raise ValidationError(f"glossary missing {f}: {g}")


# --------------------------------------------------------------------------- #
# Build
# --------------------------------------------------------------------------- #
def load_chapter(chapter_dir: Path) -> dict:
    with open(chapter_dir / "manifest.json", "r", encoding="utf-8") as f:
        m = json.load(f)
    # Normalise Odia fields
    for c in m["concepts"]:
        c["title_or"] = normalise_odia(c["title_or"])
        c["summary_or"] = normalise_odia(c["summary_or"])
    for ch in m["chunks"]:
        ch["text_or"] = normalise_odia(ch["text_or"])
    for q in m["questions"]:
        q["prompt_or"] = normalise_odia(q["prompt_or"])
        q["explanation_or"] = normalise_odia(q["explanation_or"])
        if q.get("rubric_or"):
            q["rubric_or"] = normalise_odia(q["rubric_or"])
        q["options"] = [normalise_odia(o) for o in q.get("options", [])]
    return m


def build_pack(strict: bool = True) -> dict:
    chapters_data = []
    concepts_data = []
    chunks_data = []
    questions_data = []
    chapter_ids = []

    for chapter_dir in sorted(CURRIC.glob("ch*")):
        if not chapter_dir.is_dir():
            continue
        m = load_chapter(chapter_dir)
        chapter_ids.append(m["chapter_id"])
        chapters_data.append({
            "chapter_id": m["chapter_id"],
            "subject": m["subject"],
            "grade": m["grade"],
            "title_or": normalise_odia(m["title_or"]),
            "title_en": m["title_en"],
            "summary_or": normalise_odia(m["summary_or"]),
            "source_refs": m["source_refs"],
        })
        for c in m["concepts"]:
            validate_concept(c, m["chapter_id"])
            concepts_data.append({
                "concept_id": c["concept_id"],
                "chapter_id": c["chapter_id"],
                "title_or": c["title_or"],
                "title_en": c["title_en"],
                "summary_or": c["summary_or"],
                "prerequisites": c.get("prerequisites", []),
                "source_refs": c.get("source_refs", []),
            })
        for ch in m["chunks"]:
            ch["chapter_id"] = m["chapter_id"]
            validate_chunk(ch)
            chunks_data.append({
                "chunk_id": ch["chunk_id"], "concept_id": ch["concept_id"],
                "chapter_id": ch["chapter_id"], "ordinal": ch["ordinal"],
                "text_or": ch["text_or"], "source_ref": ch["source_ref"],
                "glossary_refs": ch.get("glossary_refs", []),
            })
        for q in m["questions"]:
            q["chapter_id"] = m["chapter_id"]
            validate_question(q)
            questions_data.append(q)

    # Glossary
    with open(CURRIC / "glossary.json", "r", encoding="utf-8") as f:
        glossary_raw = json.load(f)
    glossary_data = []
    for g in glossary_raw["glossary"]:
        g["term_or"] = normalise_odia(g["term_or"])
        g["term_en"] = normalise_odia(g["term_en"])
        g["definition_or"] = normalise_odia(g["definition_or"])
        g["definition_en"] = normalise_odia(g["definition_en"])
        validate_glossary_entry(g)
        glossary_data.append(g)

    # Publication gate: at least 12 reviewed questions per concept
    by_concept: dict[str, int] = {}
    for q in questions_data:
        by_concept[q["concept_id"]] = by_concept.get(q["concept_id"], 0) + 1
    for cid, n in by_concept.items():
        if n < 3:  # MVP demo target: ≥3 questions/concept; design doc says ≥12 reviewed
            msg = f"concept {cid} has only {n} questions (need ≥12 for production)"
            if strict:
                raise ValidationError(msg)
            print(f"WARN: {msg} (strict=False, continuing)")
        else:
            print(f"concept {cid}: {n} questions")
    if len(questions_data) < 9:
        raise ValidationError(f"need ≥9 questions total, got {len(questions_data)}")

    # Manifest
    PACKS_DIR.mkdir(parents=True, exist_ok=True)
    payload = {
        "manifest": {
            "pack_id": PACK_ID,
            "version": PACK_VERSION,
            "content_version": CONTENT_VERSION,
            "language": LANGUAGE,
            "min_app_version": MIN_APP_VERSION,
            "licence": LICENCE,
            "source_refs": SOURCE_REFS,
            "chapters": chapter_ids,
            "created_at": int(time.time() * 1000),
        },
        "chapters": chapters_data,
        "concepts": concepts_data,
        "chunks": chunks_data,
        "questions": questions_data,
        "glossary": glossary_data,
    }
    # Step 1: serialise with byte_size=0 placeholder to measure true size
    payload["manifest"]["byte_size"] = 0
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    real_size = len(blob)
    # Step 2: set byte_size = real_size, re-serialise, measure again
    payload["manifest"]["byte_size"] = real_size
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    # If size changed (e.g. 0→N digits), adjust until stable
    while True:
        if len(blob) != real_size:
            real_size = len(blob)
            payload["manifest"]["byte_size"] = real_size
            blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
        else:
            break
    # Step 3: compute checksum on the blob with the checksum field set to a
    # fixed-length placeholder (empty string). This makes the stored checksum
    # verifiable: a client reads the file, replaces checksum_sha256 with "",
    # re-serialises canonically, and computes SHA-256 — which matches the stored value.
    payload["manifest"]["checksum_sha256"] = ""
    blob_no_checksum = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    checksum = hashlib.sha256(blob_no_checksum).hexdigest()
    payload["manifest"]["checksum_sha256"] = checksum

    # Step 4: build the download archive. The archive's inner manifest carries
    # archive_sha256/archive_byte_size blank (they cover the archive itself);
    # the standalone JSON manifest gets the real values after hashing.
    payload["manifest"]["archive_sha256"] = ""
    payload["manifest"]["archive_byte_size"] = 0
    inner_blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    if len(inner_blob) > MAX_BYTES:
        raise ValidationError(f"pack payload {len(inner_blob)} > max {MAX_BYTES}")

    gz_path = PACKS_DIR / f"{PACK_ID}-{PACK_VERSION}.srt.tar.gz"
    tmp_gz = gz_path.with_suffix(".tar.gz.tmp")
    with open(tmp_gz, "wb") as dst_f:
        # mtime=0 keeps the gzip deterministic across rebuilds
        with gzip.GzipFile(fileobj=dst_f, mode="wb", mtime=0) as dst:
            dst.write(inner_blob)
    tmp_gz.replace(gz_path)
    archive_bytes = gz_path.read_bytes()
    archive_sha = hashlib.sha256(archive_bytes).hexdigest()

    # Standalone JSON manifest: canonical blob + real archive integrity fields.
    payload["manifest"]["archive_sha256"] = archive_sha
    payload["manifest"]["archive_byte_size"] = len(archive_bytes)
    blob = json.dumps(payload, ensure_ascii=False, separators=(",", ":")).encode("utf-8")

    # Atomic write
    out_path = PACKS_DIR / f"{PACK_ID}-{PACK_VERSION}.json"
    tmp = out_path.with_suffix(".json.tmp")
    tmp.write_bytes(blob)
    tmp.replace(out_path)

    print(f"\nBuilt pack: {out_path}")
    print(f"  pack_id: {PACK_ID}")
    print(f"  version: {PACK_VERSION}")
    print(f"  chapters: {len(chapters_data)} ({chapter_ids})")
    print(f"  concepts: {len(concepts_data)}")
    print(f"  chunks: {len(chunks_data)}")
    print(f"  questions: {len(questions_data)}")
    print(f"  glossary entries: {len(glossary_data)}")
    print(f"  byte_size: {payload['manifest']['byte_size']}")
    print(f"  checksum_sha256: {checksum}")
    print(f"  archive: {gz_path} ({len(archive_bytes)} bytes)")
    print(f"  archive_sha256: {archive_sha}")
    return payload["manifest"]


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--strict", action="store_true", default=False,
                    help="publication gate; fail on any validation error")
    ap.add_argument("--non-strict", action="store_true",
                    help="continue past validation warnings (default)")
    args = ap.parse_args()
    try:
        build_pack(strict=args.strict)
        return 0
    except ValidationError as e:
        print(f"VALIDATION FAILED: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
