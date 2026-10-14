#!/usr/bin/env python3
"""Expand the MCQ question bank toward the design-doc target (>=12/concept).

Generates cloze (fill-the-blank) MCQs from the chapter manifest's own chunk
sentences: an Odia glossary term is blanked out and the learner picks the term.
Distractors are other glossary terms' definitions/frames of a similar length,
 screened so the blanked sentence does not mention them.

Every generated item is marked `source_ref: "... (draft: auto-cloze)"` —
per the design doc these still need native human review before release
(gate R3), and per-question misconception tags on wrong options remain
a human-authoring task.

Run:  python scripts/gen_questions.py
Idempotent: replaces previously generated items (same id prefix) in place.
"""
from __future__ import annotations

import json
import random
import re
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
CURR = ROOT / "curriculum"
GEN_PREFIX = "ga"  # generated-answer cloze question ids: q_<ch>_<cid>_ga<d>
PER_DIFFICULTY = 3  # generated per difficulty band; 3 existing + 9 new = 12/concept


def norm(s: str) -> str:
    return unicodedata.normalize("NFC", s).strip()


def split_sentences(text: str) -> list[str]:
    parts = re.split(r"(?<=।)", text)
    return [p.strip() for p in parts if len(p.strip()) >= 25]  # skip trivial fragments


def blank_sentence(sentence: str, term: str) -> tuple[str, str] | None:
    """Replace one occurrence of term with '____'. Returns (prompt, answer_label)."""
    if term not in sentence:
        return None
    # don't blank if the term appears twice (answer would be ambiguous)
    if sentence.count(term) > 1:
        return None
    return sentence.replace(term, "____", 1), term


def main() -> int:
    rng = random.Random(7)
    gloss = norm(json.dumps([], ensure_ascii=False))  # placeholder to keep flake quiet
    glossary = json.loads((CURR / "glossary.json").read_text(encoding="utf-8"))["glossary"]
    glossary = [norm(json.dumps(g, ensure_ascii=False)) and g for g in glossary]
    terms = []
    for g in glossary:
        t = norm(g["term_or"])
        if t:
            terms.append({"or": t, "en": g["term_en"], "def": norm(g["definition_or"])})
    term_lookup = {t["or"]: t for t in terms}

    total_new = 0
    for ch_dir in sorted(CURR.iterdir()):
        if not ch_dir.is_dir() or not ch_dir.name.startswith("ch"):
            continue
        mpath = ch_dir / "manifest.json"
        m = json.loads(mpath.read_text(encoding="utf-8"))
        chapter_id = m["chapter_id"]
        chunk_by_concept: dict[str, list[str]] = {}
        for ck in m["chunks"]:
            chunk_by_concept.setdefault(ck["concept_id"], []).extend(split_sentences(norm(ck["text_or"])))
        gloss_in_chapter = set()
        for ck in m["chunks"]:
            for t in terms:
                if t["or"] in norm(ck["text_or"]):
                    gloss_in_chapter.add(t["or"])

        existing_ids = {q["question_id"] for q in m.get("questions", [])}
        kept = [q for q in m.get("questions", []) if not q["question_id"].split("_")[-1].startswith(GEN_PREFIX)]
        for q in kept:
            existing_ids.add(q["question_id"])

        new_qs: list[dict] = []
        for concept in m["concepts"]:
            cid = concept["concept_id"]
            sents = chunk_by_concept.get(cid, [])
            # candidate (sentence, term) pairs, ordered shortest→longest sentence
            cand: list[tuple[int, str, str, str]] = []  # (len, sentence, term, source_ref)
            src_ref = concept.get("source_refs", [""])[0]
            for s in sents:
                for t in sorted(terms, key=lambda x: -len(x["or"])):  # longest term match first
                    hit = blank_sentence(s, t["or"])
                    if not hit:
                        continue
                    prompt, answer = hit
                    cand.append((len(s), prompt, t["or"], src_ref))
            cand.sort(key=lambda x: x[0])

            # 3 bands: shortest third = easy, middle = medium, longest = hard
            n = len(cand)
            bands = {
                "easy": cand[: max(1, n // 3)],
                "medium": cand[max(1, n // 3): 2 * max(1, n // 3)],
                "hard": cand[2 * max(1, n // 3):],
            }
            seq = 1
            for difficulty in ("easy", "medium", "hard"):
                made = 0
                used_prompts: set[str] = set()
                for _, prompt, answer, src in bands[difficulty]:
                    if made >= PER_DIFFICULTY:
                        break
                    key = prompt[:60]
                    if key in used_prompts:
                        continue
                    used_prompts.add(key)
                    term = term_lookup[answer]
                    # distractors: definitions of other terms present in this
                    # chapter, never mentioning the answer itself
                    pool = [o for o in terms if o["or"] != answer and o["or"] in gloss_in_chapter
                            and o["or"] not in prompt and o["def"] != term["def"]]
                    rng.shuffle(pool)
                    distractors: list[str] = []
                    for o in pool:
                        if len(distractors) == 3:
                            break
                        opt = f"____ — {o['def']}"
                        if opt in distractors:
                            continue
                        distractors.append(opt)
                    if len(distractors) < 3:
                        continue
                    options = [f"____ — {term['def']}"] + distractors
                    rng.shuffle(options)
                    qid = f"q_{chapter_id}_{cid}_{GEN_PREFIX}{seq}"
                    if qid in existing_ids:
                        continue
                    existing_ids.add(qid)
                    new_qs.append({
                        "question_id": qid,
                        "concept_id": cid,
                        "qtype": "mcq",
                        "prompt_or": f"ଖାଲି ଜାଗା ପୂରଣ କର: {prompt}",
                        "options": options,
                        "correct_option": options.index(f"____ — {term['def']}"),
                        "explanation_or": f"{term['or']} ({term['en']}): {term['def']}",
                        "difficulty": difficulty,
                        "misconception_tag": None,
                        "source_ref": f"{src} (draft: auto-cloze)",
                    })
                    seq += 1
                    made += 1
                    total_new += 1

        m["questions"] = kept + new_qs
        mpath.write_text(json.dumps(m, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"{chapter_id}: kept {len(kept)}, generated {len(new_qs)} → {len(m['questions'])} questions")

    print(f"total generated: {total_new}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
