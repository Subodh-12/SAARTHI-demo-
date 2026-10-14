# SAARTHI — Implementation Decisions

Genuine conflicts/open decisions encountered during implementation, with the resolution chosen and the reason. New entries are appended as decisions are made.

---

## D-001 — Persistence backend: PostgreSQL vs SQLite for the MVP

**Conflict:** The prompt and design doc specify PostgreSQL as the durable server store, with MinIO/S3 optional and Redis optional. The development environment has no PostgreSQL service available.

**Resolution:** Implement a PersistenceProvider interface with two adapters:
- `sqlalchemy` adapter (default for MVP) using SQLite via `aiosqlite` — durable, transactional, file-based, supports the constraints we need (unique keys, foreign keys, CHECK constraints, JSON columns).
- `postgres` adapter (production) — same schema, behind the same interface, selected by `PERSISTENCE_BACKEND=postgres` + `DATABASE_URL`.

Schema migrations are written as idempotent SQL DDL managed by a tiny migration runner in `backend/app/core/migrations.py` (and mirrored for Alembic when running on PostgreSQL). The repository layer never talks to the driver directly; it depends on the interface.

**Reason:** Avoids fabricating a Postgres run that did not happen; preserves the same SQL contracts; keeps one-command startup working without Docker; the same code paths are testable end-to-end. Migration to Postgres is a config switch, not a rewrite.

**MVP boundary:** MVP acceptance is met with SQLite. Production readiness for a real student pilot requires running the same suite against PostgreSQL (a documented, unmet-in-env verification item, not a silent claim).

---

## D-002 — Object storage: MinIO/S3 not required for the MVP

**Conflict:** Design doc allows MinIO/S3 for pack blobs.

**Resolution:** Packs are compact JSON+text archives (target <2 MB each for three chapters). The MVP stores pack files on the local filesystem under `packs/` and serves them via a FastAPI route. An ObjectStorageProvider interface is provided; the local-fs adapter is the default. S3/MinIO can be added later by implementing the interface.

**Reason:** No operational need for the MVP scope; avoids adding infrastructure. Aligns with the rule "do not require it if the MVP can serve compact packs safely without it."

---

## D-003 — Redis: not required for correctness

**Conflict:** Design doc says Redis is optional, not mandatory.

**Resolution:** No Redis dependency. Short-lived caches use in-process bounded LRU (configurable TTL/size). Workers do not own durable state — see D-001.

---

## D-004 — LangGraph: real package, real graph; cloud checkpoints replaced by SQL checkpoints

**Conflict:** Design doc says use LangGraph and store checkpoints server-side. The default `langgraph-checkpoint` backends are Redis/Postgres.

**Resolution:** Install `langgraph` (1.2.14) and build the orchestration graph with `StateGraph`, typed nodes, conditional edges, and bounded tool execution. For checkpointing, implement a tiny `SQLCheckpointSaver` that conforms to the langgraph BaseCheckpointSaver protocol and writes to the same SQL DB. This is the "PostgreSQL checkpoint" requirement adapted to the SQLite default backend; the saver is swappable to Postgres by changing the connection string.

---

## D-005 — Retrieval: FAISS not available in env; pure-Python dense + BM25 hybrid behind the RetrievalProvider interface

**Conflict:** Design doc says FAISS dense retrieval + inverted/keyword index, hybrid ranking.

**Resolution:** Implement RetrievalProvider with two adapters:
- `local_hybrid` (default) — pure-Python cosine over deterministic hash embeddings (configurable to use real embeddings when an EmbeddingsProvider is configured) + BM25 via `rank-bm25`; reciprocal rank fusion.
- `faiss_hybrid` — selected by `RETRIEVAL_PROVIDER=faiss` when `faiss-cpu` is installed. Same interface.

For the demo pack, hash embeddings are deterministic and content-keyed so retrieval is reproducible across runs and matches the TypeScript-side pack-time keyword index.

**Reason:** `faiss-cpu` install timed out in the env. The interface is identical; switching to FAISS is a config change. M8 acceptance is met with the local hybrid retriever.

---

## D-006 — Embeddings: no `sentence-transformers` in env; configurable provider with mock default

**Resolution:** EmbeddingsProvider interface with:
- `mock` (default) — deterministic hash-based vectors, 256-dim, normalised, content-keyed. Suitable for reproducible tests and demo pack.
- `hf` — `sentence-transformers` `paraphrase-multilingual-MiniLM-L12-v2` or similar, lazy-loaded, optional.
- `openai` — API call, optional, gated by `LLM_API_KEY`.

**Reason:** Same interface, same retrieval path. Live multilingual embeddings are an opt-in improvement with a labelled eval harness (M8.A.3) ready to consume them.

---

## D-007 — Hugging Face translation tool: real adapter, gated access, typed unavailable error + extractive fallback

**Conflict:** Prompt M8.B requires the HF translation tool (`ai4bharat/indictrans2-indic-en-dist-200M` and `…-en-indic-dist-200M`) to be a real LangGraph tool that the graph actually calls. Access to the model files requires accepting gated repo conditions. No HF token in env.

**Resolution:**
- Implement `HuggingFaceTranslationProvider` that lazily loads IndicTrans2 via `transformers` when `TRANSLATION_PROVIDER=hf_local` and `HF_TOKEN` is set and the repo has been gated. The provider honours the official language-code mapping (`ory` for Odia, `en` for English) and uses the model's `IndicProcessor`.
- Implement `MockTranslationProvider` (default) that returns a typed `ToolError(error_code="translation.provider_unavailable", …)` for any non-trivial request and a passthrough for already-Odia text. This is the explicit "typed provider-unavailable error" the prompt requires.
- Expose `translate_text` as a real LangGraph tool in the orchestration graph. The graph calls it conditionally when normalisation/code-mixing is detected; on `provider_unavailable` the graph falls back to original-Odia retrieval + glossary expansion (no fake translation).
- A `doctor`/health diagnostic reports the provider status without downloading weights.
- A documented command (`python -m app.adapters.ai.translation hf warm`) is provided to accept/access and warm the model.
- An opt-in live integration test (marked `@pytest.mark.live_hf`) covers the real provider when access exists.

**Reason:** No model access in env. The prompt explicitly allows this fallback path and forbids faking translation. The graph still invokes the tool; the tool still returns a typed result/error; orchestration still degrades safely. All other work continues.

---

## D-008 — LLM generation: provider interface, mock default = extractive (not a fake LLM)

**Resolution:** GenerationProvider interface with:
- `mock` (default) — returns the top-ranked retrieved chunk as the answer with full citation. This is an *extractive* fallback, not a fabricated LLM output. Marked `provenance=extractive`.
- `openai` — real chat completion when `LLM_API_KEY` is set, with grounded system prompt, tool-restricted output schema, and deterministic validators on the response.

The mock provider always returns a typed result with `provenance="extractive"` and a `basic_answer_status` field so the UI can label it. This is the design doc's "extractive answer with a clear basic-answer status."

---

## D-009 — Sync ordering: one active device per learner for MVP, multi-device documented

**Conflict:** Design doc M7.4 says multi-device merging must be deterministic; if it cannot be made reliable for MVP, restrict to one active device per learner and document.

**Resolution:** MVP restricts sync to one active device per learner (`learner_devices.active = true` unique). Multi-device events from the same learner are queued and a `multi_device_conflict` typed error is returned, with a documented upgrade path (event-time tie-break by `event_id` and a server-side reconciler).

---

## D-010 — PWA + service worker: Vite plugin, Workbox, Dexie

**Resolution:** Use `vite-plugin-pwa` with `injectManifest` strategy and Workbox for runtime caching; Dexie for IndexedDB. Service worker caches app shell (cache-first) and versioned packs (cache-first with versioned URLs).

---

## D-011 — Decision engine: pure functions, shared JSON ruleset, no LLM in the loop

**Resolution:** `packages/ruleset/rules.json` is the single source of truth. Both `backend/app/domain/decide.py` and `frontend/src/engine/decide.ts` consume the same JSON file via a shared test-vector generator (`scripts/gen_rule_vectors.py`). The LLM never selects the action; it only assists retrieval/generation/translation inside bounded LangGraph nodes.

---

## D-012 — Authn: device-bound token, no end-user passwords

**Resolution:** On profile creation the server issues a random 256-bit `device_token` (URL-safe). The client stores it in IndexedDB and sends it as `Authorization: Bearer <token>`. The server resolves `device_id` and the active `learner_id` per request. Tokens are renewable via `/api/v1/auth/renew`. No phone, no email, no PII. Local PIN (optional) is hashed on-device with PBKDF2 and only used to gate UI; never sent to the server.

---

## D-013 — Voice (P1) and prefetch: voice deferred; prefetch implemented as P0

**Resolution:** Voice (ASR/TTS) is marked P1/deferred in `docs/requirements_traceability.md`. Pack prefetch is implemented as a P0 feature under the network/battery/storage rules.

---

## D-014 — Frontend stack: keep Vite + React + TS + Tailwind (per design doc), not Next.js

**Resolution:** The prompt's TARGET TECHNOLOGY section explicitly says "Frontend: React, TypeScript, Vite, Tailwind CSS, installable PWA." Keep this stack. Do not migrate to Next.js.
