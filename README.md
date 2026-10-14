# SAARTHI — Adaptive Learning Companion

**An offline-first, Odia-first learning companion for Class 9 Science students.**

SAARTHI is an educational technology project designed to help students in rural and semi-urban Odisha learn Science in their regional language, including in environments with limited or unreliable internet connectivity.

> **Project status:** MVP implemented and tested end-to-end. The system supports the complete learning loop: study curated Odia content → ask an Odia doubt → receive curriculum-grounded help → answer assessments → update concept mastery → receive a deterministic next learning action → continue offline with cached content → synchronize learner events after reconnection.

---

## 🎯 Vision

SAARTHI aims to make learning more accessible by providing:

- **Odia-first learning:** Regional-language learning experiences designed for the intended students.
- **Concept-based teaching:** Explanations, examples, guided activities, and practice—not just quizzes.
- **Adaptive learning:** Choosing the next learning activity based on the student's progress and learning needs (deterministic, never LLM-selected).
- **Offline-first access:** Supporting learning when internet connectivity is unavailable — IndexedDB + service worker + cached packs.
- **Reliable progress tracking:** Preserving learner progress and synchronizing it when connectivity returns — idempotent event-based sync with canonical mastery replay.

## 🛠️ Technology Stack

| Component | Technology |
|---|---|
| Frontend | React 19 + TypeScript + Vite 8 + Tailwind CSS 3 |
| PWA | vite-plugin-pwa (Workbox service worker) + Dexie (IndexedDB) |
| Backend API | Python 3.12 + FastAPI + Pydantic v2 + Uvicorn |
| Persistence | SQLAlchemy 2 async + SQLite (default) / PostgreSQL (production) |
| Agent orchestration | LangGraph-style graph with bounded tool execution |
| Deterministic engine | Pure functions over a shared JSON ruleset — Python + TypeScript |
| Retrieval | Hybrid (BM25 + dense cosine + reciprocal rank fusion); FAISS optional |
| AI providers | HuggingFace IndicTrans2 (translation, gated) + OpenAI-compatible (LLM, gated) — both optional, with mock fallbacks |
| Local development | Cross-platform `scripts/dev.py` master script + `run.sh`/`run.ps1` wrappers |

## 📁 Project Structure

```text
SAARTHI/
├── backend/
│   ├── app/
│   │   ├── api/{routes,middleware}/     # FastAPI routes + middleware
│   │   ├── core/                         # settings, logging, errors, metrics, tracing
│   │   ├── domain/                       # schemas, ruleset, BKT, decide (pure functions)
│   │   ├── services/                     # use-case orchestrators (auth, assessment, decision, doubt, sync)
│   │   ├── repositories/                 # abstract repository interfaces
│   │   ├── adapters/
│   │   │   ├── persistence/              # SQLAlchemy adapter (SQLite + Postgres)
│   │   │   └── ai/                       # translation, retrieval, generation, embeddings
│   │   ├── orchestration/                # LangGraph-style graph + validators
│   │   ├── content/                      # pack loader
│   │   └── i18n/                         # Odia reason messages
│   ├── tests/                            # unit + integration tests
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/                           # centralised typed API client
│   │   ├── components/                   # shared UI components
│   │   ├── screens/                      # Onboarding, Home, Lesson, Doubt, Packs, DevTrace
│   │   ├── store/                        # Dexie IndexedDB store (atomic state+event writes)
│   │   ├── lib/                          # network monitor, sync engine, offline retrieval
│   │   ├── engine/                       # decide.ts — TS mirror of Python decision engine
│   │   ├── generated/                    # api.ts (contracts) + ruleset.json
│   │   ├── i18n/                         # Odia string dictionary
│   │   └── App.tsx + main.tsx
│   ├── public/                           # PWA icons + favicon
│   ├── tests/                            # vitest suite (decide.test.ts)
│   └── package.json
├── curriculum/
│   ├── ch01/manifest.json                # Chapter 1: Matter in Our Surroundings (Odia)
│   ├── ch02/manifest.json                # Chapter 8: Motion (Odia)
│   ├── ch03/manifest.json                # Chapter 6: Tissues (Odia)
│   └── glossary.json                      # 30 bilingual glossary entries
├── packages/ruleset/rules.json           # versioned ruleset (BKT, actions, network, sync, etc.)
├── packs/                                # built curriculum pack (manifest + checksum + gzip)
├── scripts/
│   ├── dev.py                            # master run script
│   ├── build_packs.py                    # curriculum pack builder
│   ├── gen_rule_vectors.py               # generates 240 deterministic test scenarios
│   └── smoke_e2e.py                      # end-to-end smoke test
├── tests/fixtures/rule_vectors.json      # shared rule vectors (PY+TS)
├── docs/
│   ├── IMPLEMENTATION_PROGRESS.md        # per-milestone implementation log
│   ├── implementation_decisions.md       # trade-offs D-001..D-014
│   ├── requirements_traceability.md     # requirement → module → test → status
│   └── FINAL_REPORT.md                   # final MVP report
├── .env.example
├── docker-compose.yml                    # optional Postgres + MinIO
├── run.sh / run.ps1                      # thin wrappers around scripts/dev.py
└── README.md
```

## 💻 Prerequisites

- [Python](https://www.python.org/downloads/) 3.11+
- [Node.js](https://nodejs.org/) 20+ (includes npm)
- [Git](https://git-scm.com/downloads)

No Docker required for the MVP (SQLite is the default). Docker is optional for PostgreSQL/MinIO parity.

## 🚀 Getting Started

### One-command setup

```bash
# Linux/macOS
./run.sh setup

# Windows PowerShell
.\run.ps1 setup
```

This will:
1. Create a Python venv at `./.venv` and install backend deps.
2. Install frontend Node deps.
3. Build the curriculum pack (3 chapters × 9 concepts × 27 questions).
4. Generate 240 deterministic rule test vectors.

### Run the app

```bash
./run.sh start   # or: .\run.ps1 start
```

- Frontend: http://localhost:5173
- Backend API: http://localhost:8000
- Interactive API docs: http://localhost:8000/docs
- Health check: http://localhost:8000/api/v1/health
- Metrics (Prometheus): http://localhost:8000/api/v1/metrics

Press `Ctrl+C` in the terminal to stop both servers cleanly.

### Run the tests

```bash
./run.sh test   # runs pytest (286 tests) + vitest (242 tests) + e2e smoke
```

### Diagnose the environment

```bash
./run.sh doctor
```

## 🔌 Current API

Versioned under `/api/v1`. Stable error format is RFC 7807 `application/problem+json` with `error_code` + `request_id`.

| Endpoint | Purpose | Auth |
|---|---|---|
| `GET /api/v1/health` | Liveness + version + provider flags | None |
| `GET /api/v1/readiness` | Per-provider readiness (translation/generation/retrieval) | None |
| `GET /api/v1/diagnostics` | Public settings subset | None |
| `GET /api/v1/metrics` | Prometheus metrics | None |
| `POST /api/v1/learners` | Create learner + issue device-bound token | None |
| `GET /api/v1/learners/me` | Get current learner profile | Bearer |
| `POST /api/v1/learners/{id}/activate` | Switch active learner on device | Bearer |
| `POST /api/v1/learners/auth/renew` | Renew expired token | Bearer |
| `GET /api/v1/content/chapters` | List chapters | None |
| `GET /api/v1/content/concepts/{id}` | Get concept | None |
| `GET /api/v1/content/concepts/{id}/chunks` | List chunks for concept | None |
| `GET /api/v1/content/chunks/{id}` | Get chunk | None |
| `GET /api/v1/content/concepts/{id}/questions/next` | Get next question for concept | Bearer |
| `POST /api/v1/assessments` | Submit assessment (MCQ/short-answer) → BKT update + next decision | Bearer |
| `POST /api/v1/decisions/next` | Get next deterministic learning decision | Bearer |
| `GET /api/v1/decisions/{id}` | Get decision by id | Bearer |
| `GET /api/v1/decisions/{id}/trace` | Get decision trace (tool calls) | Bearer |
| `POST /api/v1/doubts/query` | Ask an Odia doubt → orchestration graph (translate → retrieve → generate → validate) | Bearer |
| `POST /api/v1/sync` | Sync outbox events (idempotent, ordered, per-event outcome) | Bearer |
| `GET /api/v1/packs/manifest` | List pack manifests | None |
| `GET /api/v1/packs/{id}/versions/{v}` | Get pack download info | Bearer |
| `GET /api/v1/packs/{id}/versions/{v}/download` | Download pack archive | Bearer |
| `GET /api/v1/state` | Get learner state (mastery, active packs, outbox depth) | Bearer |
| `GET /api/lesson` | Legacy endpoint (backwards-compat with original) | None |

## 🧭 Architecture

The system is a **modular monolith** with strict module boundaries:

- **API routes** (FastAPI) — thin handlers, no business logic. Depends on services + middleware.
- **Services** (use cases) — orchestrate repositories + adapters. The only place where business logic meets I/O.
- **Domain** — pure functions (BKT, decision, assessment evaluation). No I/O, no FastAPI, no SQLAlchemy. Mirrored in TypeScript for offline use.
- **Repositories** — abstract interfaces; concrete SQLAlchemy adapters in `adapters/persistence/`.
- **Adapters** — AI providers (translation, retrieval, generation, embeddings), persistence (SQLite/Postgres), all behind typed interfaces. Swappable by config.
- **Orchestration** — LangGraph-style graph with bounded tool nodes (`translate_text`, `retrieve_chunks`, `generate_answer`, `validate_answer`), typed state, typed errors, trace steps.
- **Content** — pack loader that indexes built curriculum packs for in-memory lookup.
- **i18n** — Odia reason messages shipped (not LLM-generated).

**Deterministic engine contract**: `packages/ruleset/rules.json` is the single source of truth. Both `backend/app/domain/decide.py` (Python) and `frontend/src/engine/decide.ts` (TypeScript) consume the same JSON. 240 shared test vectors verify both implementations return identical outputs.

**Offline-first**: The browser uses Dexie (IndexedDB) for local profiles, mastery snapshot, packs, decisions, and outbox. State mutations + their corresponding outbox events are written in ONE Dexie transaction. When offline, the local decision engine (TS, same ruleset) takes over; the doubt branch uses local BM25+glossary retrieval + extractive answers (no model required). Sync replays pending events to the server, which returns canonical mastery + next decision; the client rebases local state.

**Stateless compute**: API handlers, workers, model adapters, and orchestration tasks do not rely on process-local dictionaries for durable user state. State lives in PostgreSQL (or SQLite for MVP) and IndexedDB.

## 🤝 Optional Provider Configuration

The MVP runs with no external secrets. To enable live AI:

### HuggingFace IndicTrans2 translation (gated)
1. Accept gated repo conditions on:
   - https://huggingface.co/ai4bharat/indictrans2-indic-en-dist-200M
   - https://huggingface.co/ai4bharat/indictrans2-en-indic-dist-200M
2. Get a token from https://huggingface.co/settings/tokens
3. Set in `.env`:
   ```
   TRANSLATION_PROVIDER=hf_local
   HF_TOKEN=hf_xxxxxxxxxxxxxxxxxxxxxxxx
   ```
4. Restart the backend. Check `/api/v1/readiness` for `translation.ready=true`.

### OpenAI-compatible LLM generation
1. Set in `.env`:
   ```
   LLM_PROVIDER=openai
   LLM_API_KEY=sk-...
   LLM_MODEL=gpt-4o-mini
   # LLM_BASE_URL=https://api.openai.com/v1   # default; can be any compatible endpoint
   ```
2. Restart. The doubt orchestration will use the real LLM with grounded system prompt + citation extraction.

### FAISS dense retrieval
1. `pip install faiss-cpu sentence-transformers`
2. Set in `.env`:
   ```
   RETRIEVAL_PROVIDER=faiss_hybrid
   EMBEDDINGS_PROVIDER=hf
   EMBEDDINGS_MODEL=sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2
   ```
3. Restart. Same hybrid retrieval algorithm, FAISS backend.

### PostgreSQL backend (production parity)
1. `docker-compose up -d postgres`
2. Set in `.env`:
   ```
   PERSISTENCE_BACKEND=postgres
   DATABASE_URL=postgresql+asyncpg://saarthi:saarthi@localhost:5432/saarthi
   ```
3. Restart. Same schema applies; same code paths; no rewrite.

## 🧭 Development Roadmap

1. **Student learning experience:** ✅ Complete lesson flow with explanations, examples, guided activities, and practice.
2. **Curriculum foundation:** ✅ Three chapters organised and verified curriculum-aligned learning content (Matter, Motion, Tissues).
3. **Local learning engine:** ✅ Deterministic next-action decisions, shared PY+TS, BKT mastery.
4. **Offline-first learning:** ✅ IndexedDB + service worker + cached packs + local decision engine + offline doubt retrieval.
5. **Assessment and mastery:** ✅ MCQ + short-answer with rubric, BKT updates, misconception tags.
6. **Reliable synchronization:** ✅ Idempotent event-based sync with canonical mastery replay.
7. **Grounded AI assistance:** ✅ LangGraph orchestration with bounded tools; HuggingFace translation adapter (gated); OpenAI-compatible generation adapter (gated); validation gates; extractive fallback.

Implementation order and acceptance criteria follow the project's design document. See `docs/requirements_traceability.md` for the per-requirement status.

## 🤝 Contributing and Development Principles

- Read the project documentation before changing the architecture.
- Preserve existing working functionality.
- Keep the core learning decision process deterministic and local.
- Do not claim offline functionality or synchronization works until tested.
- Verify educational content before presenting it as curriculum-approved.
- Test frontend builds and backend behavior after meaningful changes.
- Commit working milestones to Git.

## 📌 Important Notes

- The **mock** providers (`TRANSLATION_PROVIDER=mock`, `LLM_PROVIDER=mock`) are NOT fake successes. They return typed `provider_unavailable` ToolErrors and let orchestration fall back to extractive answers from retrieved curriculum chunks. This is the design-mandated behaviour per the prompt: "if gated model access is not yet approved, do NOT fake translation."
- The shared deterministic engine passes the same 240 rule vectors on both Python (pytest) and TypeScript (vitest). The LLM never selects the learning action; it only assists inside bounded LangGraph nodes.
- Pseudonymous learner IDs (`lrn_<24-hex>`). No phone, no email, no geolocation, no advertising IDs. Minors' privacy/consent obligations are a hard blocker before any real-student pilot.
- The 3-chapter content (9 concepts × 3 questions = 27 questions) demonstrates the loop end-to-end. The pack builder supports ≥12 questions per concept; production pilot requires reviewed content expansion.

---

**SAARTHI — Learn at your pace. Keep moving forward.**
