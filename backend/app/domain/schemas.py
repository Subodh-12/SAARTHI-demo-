"""Pydantic v2 schemas — single source of truth for SAARTHI contracts.

OpenAPI is generated from these models by FastAPI automatically. The
TypeScript contracts in `frontend/src/generated/api.ts` are produced from
the OpenAPI schema by `scripts/gen_types.py`.
"""
from __future__ import annotations

import hashlib
import time
import unicodedata
import uuid
from datetime import datetime, timezone
from enum import Enum
from typing import Annotated, Any, Literal, Optional

from pydantic import BaseModel, Field, StringConstraints


# --------------------------------------------------------------------------- #
# Identifiers
# --------------------------------------------------------------------------- #
LearnerId = Annotated[str, StringConstraints(pattern=r"^lrn_[A-Za-z0-9]{16,32}$")]
DeviceId = Annotated[str, StringConstraints(pattern=r"^dev_[A-Za-z0-9]{16,32}$")]
ConceptId = Annotated[str, StringConstraints(pattern=r"^c[0-9]{4}$")]
ChapterId = Annotated[str, StringConstraints(pattern=r"^ch[0-9]{3}$")]
ChunkId = Annotated[str, StringConstraints(pattern=r"^chunk_[A-Za-z0-9_-]{8,64}$")]
QuestionId = Annotated[str, StringConstraints(pattern=r"^q_[A-Za-z0-9_-]{6,32}$")]
PackId = Annotated[str, StringConstraints(pattern=r"^pack_[a-z0-9_]+$")]


def new_request_id() -> str:
    return uuid.uuid4().hex


def new_learner_id() -> str:
    return "lrn_" + uuid.uuid4().hex[:24]


def new_device_id() -> str:
    return "dev_" + uuid.uuid4().hex[:24]


def new_decision_id() -> str:
    return "dec_" + uuid.uuid4().hex[:24]


def new_event_id() -> str:
    return "evt_" + uuid.uuid4().hex[:24]


def new_session_id() -> str:
    return "ses_" + uuid.uuid4().hex[:24]


# --------------------------------------------------------------------------- #
# Common enums
# --------------------------------------------------------------------------- #
class NetworkState(str, Enum):
    ONLINE = "online"
    WEAK = "weak"
    OFFLINE = "offline"
    RECONNECTED = "reconnected"


class Action(str, Enum):
    REMEDIATE = "REMEDIATE"
    RETRY = "RETRY"
    REVISE = "REVISE"
    ADVANCE = "ADVANCE"


class DeliveryMode(str, Enum):
    RICH = "rich"
    CACHED = "cached"
    PREFETCH_THEN_OFFLINE = "prefetch_then_offline"


class BackgroundAction(str, Enum):
    SYNC = "SYNC"
    PREFETCH = "PREFETCH"


class EventType(str, Enum):
    LESSON_OPENED = "lesson_opened"
    LESSON_COMPLETED = "lesson_completed"
    CHUNK_VIEWED = "chunk_viewed"
    MCQ_ANSWERED = "mcq_answered"
    SHORT_ANSWER_ATTEMPTED = "short_answer_attempted"
    DOUBT_ASKED = "doubt_asked"
    NEXT_ACTION_SHOWN = "next_action_shown"
    PACK_INSTALLED = "pack_installed"
    SYNC_ACKED = "sync_acked"


class EvidenceType(str, Enum):
    CORRECT = "correct"
    INCORRECT = "incorrect"
    PARTIAL = "partial"
    NONE = "none"


class Outcome(str, Enum):
    ACCEPTED = "accepted"
    DUPLICATE = "duplicate"
    RETRYABLE = "retryable"
    REJECTED = "rejected"


# --------------------------------------------------------------------------- #
# Learner / device
# --------------------------------------------------------------------------- #
class LearnerProfileCreate(BaseModel):
    display_label: Annotated[str, StringConstraints(min_length=0, max_length=64)] = ""
    locale: Literal["or", "en"] = "or"
    grade: Literal["class9"] = "class9"
    subject: Literal["science"] = "science"
    pin_hash: Optional[str] = None  # only set if user opts into a local PIN


class LearnerProfile(LearnerProfileCreate):
    learner_id: LearnerId
    created_at: int


class DeviceRegistration(BaseModel):
    device_id: DeviceId
    hardware_label: Annotated[str, StringConstraints(max_length=64)] = "shared-android-low-end"


class DeviceToken(BaseModel):
    device_id: DeviceId
    device_token: str
    token_expires_at: int


class AuthResponse(BaseModel):
    learner_id: LearnerId
    device_id: DeviceId
    device_token: str
    token_expires_at: int


# --------------------------------------------------------------------------- #
# Curriculum
# --------------------------------------------------------------------------- #
class GlossaryEntry(BaseModel):
    term_or: str
    term_en: str
    definition_or: str
    definition_en: str


class Concept(BaseModel):
    concept_id: ConceptId
    title_or: str
    title_en: str
    chapter_id: ChapterId
    prerequisites: list[ConceptId] = Field(default_factory=list)
    summary_or: str = ""
    source_refs: list[str] = Field(default_factory=list)


class Chunk(BaseModel):
    chunk_id: ChunkId
    concept_id: ConceptId
    chapter_id: ChapterId
    ordinal: int
    text_or: Annotated[str, StringConstraints(min_length=1, max_length=4000)]
    source_ref: str
    glossary_refs: list[str] = Field(default_factory=list)


class Question(BaseModel):
    question_id: QuestionId
    concept_id: ConceptId
    chapter_id: ChapterId
    qtype: Literal["mcq", "short_answer"]
    prompt_or: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    options: list[str] = Field(default_factory=list)
    correct_option: Optional[int] = None
    rubric_or: Optional[str] = None
    expected_concepts: list[str] = Field(default_factory=list)
    explanation_or: str
    difficulty: Literal["easy", "medium", "hard"]
    misconception_tag: Optional[str] = None
    source_ref: str


class Chapter(BaseModel):
    chapter_id: ChapterId
    subject: Literal["science"] = "science"
    grade: Literal["class9"] = "class9"
    title_or: str
    title_en: str
    summary_or: str = ""
    source_refs: list[str] = Field(default_factory=list)


# --------------------------------------------------------------------------- #
# Environment + mastery + events
# --------------------------------------------------------------------------- #
class EnvironmentSnapshot(BaseModel):
    network: NetworkState = NetworkState.ONLINE
    measured_rt_ms: Optional[int] = None
    measured_loss: Optional[float] = None
    battery_saver: bool = False
    free_storage_bytes: Optional[int] = None
    installed_pack_versions: dict[PackId, str] = Field(default_factory=dict)
    ruleset_version: str


class MasteryRecord(BaseModel):
    concept_id: ConceptId
    p_known: float = Field(0.4, ge=0.0, le=1.0)
    band: Literal["unstarted", "novice", "developing", "proficient", "mastered"]
    attempts: int = 0
    correct: int = 0
    last_updated_event_seq: Optional[int] = None


class LearnerEvent(BaseModel):
    event_id: str  # client-generated, idempotent
    device_id: DeviceId
    seq: int  # monotonic per-device sequence
    learner_id: LearnerId
    ts: int  # epoch ms, client clock
    event_type: EventType
    concept_id: Optional[ConceptId] = None
    chapter_id: Optional[ChapterId] = None
    question_id: Optional[QuestionId] = None
    payload: dict[str, Any] = Field(default_factory=dict)
    # Sync metadata
    outbox_state: Literal["pending", "inflight", "acked", "dead"] = "pending"
    retry_count: int = 0


# --------------------------------------------------------------------------- #
# Assessment
# --------------------------------------------------------------------------- #
class AssessmentSubmission(BaseModel):
    question_id: QuestionId
    selected_option: Optional[int] = None  # for MCQ
    answer_text: Optional[str] = None  # for short-answer
    duration_ms: int = 0
    submitted_at: int
    evidence: EvidenceType = EvidenceType.NONE


class AssessmentResult(BaseModel):
    question_id: QuestionId
    correct: bool
    evidence: EvidenceType
    explanation_or: str
    concept_id: ConceptId
    mastery_after: MasteryRecord
    next_decision_id: str


# --------------------------------------------------------------------------- #
# Decisions / trace
# --------------------------------------------------------------------------- #
class Decision(BaseModel):
    decision_id: str
    learner_id: LearnerId
    ruleset_version: str
    target_concept_id: ConceptId
    action: Action
    delivery_mode: DeliveryMode
    background_actions: list[BackgroundAction]
    reason_code: str
    reason_or: str
    chapter_id: ChapterId
    suggested_question_id: Optional[QuestionId] = None
    suggested_chunk_id: Optional[ChunkId] = None
    network: NetworkState
    produced_by: Literal["local_engine", "server_engine"]
    created_at: int


class TraceStep(BaseModel):
    step_id: str
    node: str
    tool: Optional[str] = None
    provider: Optional[str] = None
    ruleset_version: Optional[str] = None
    model_id: Optional[str] = None
    status: Literal["ok", "error", "skipped", "fallback"]
    error_code: Optional[str] = None
    duration_ms: int
    retry: Optional[int] = None
    fallback: Optional[str] = None
    input_summary: dict[str, Any] = Field(default_factory=dict)
    output_summary: dict[str, Any] = Field(default_factory=dict)
    redacted: bool = True


class DecisionTrace(BaseModel):
    decision_id: str
    trace: list[TraceStep]


# --------------------------------------------------------------------------- #
# Doubt / retrieval / generation / translation
# --------------------------------------------------------------------------- #
class DoubtRequest(BaseModel):
    query: Annotated[str, StringConstraints(min_length=1, max_length=1000)]
    learner_id: LearnerId
    pack_ids: list[PackId] = Field(default_factory=list)


class RetrievedChunk(BaseModel):
    chunk_id: ChunkId
    concept_id: ConceptId
    chapter_id: ChapterId
    text_or: str
    source_ref: str
    score: float
    matched_terms: list[str] = Field(default_factory=list)


class RetrievedResult(BaseModel):
    chunks: list[RetrievedChunk]
    provider: str
    model_id: Optional[str] = None
    confidence: float = 0.0


class GeneratedAnswer(BaseModel):
    text_or: str
    citations: list[ChunkId] = Field(default_factory=list)
    confidence: float = 0.0
    provenance: Literal["extractive", "llm_grounded", "basic"]
    basic_answer_status: Optional[str] = None  # e.g. "provider_unavailable" / "out_of_lessons"


class DoubtResponse(BaseModel):
    answer: GeneratedAnswer
    retrieved: RetrievedResult
    decision_id: str
    translated_query: Optional[str] = None
    used_translation_tool: bool = False


# --------------------------------------------------------------------------- #
# Sync
# --------------------------------------------------------------------------- #
class SyncRequest(BaseModel):
    device_id: DeviceId
    learner_id: LearnerId
    from_seq: int  # exclusive lower bound
    events: list[LearnerEvent] = Field(default_factory=list)


class PerEventResult(BaseModel):
    event_id: str
    seq: int
    outcome: Outcome
    detail: str = ""


class SyncResponse(BaseModel):
    accepted: list[PerEventResult]
    server_learner_seq: int  # highest seq the server has for this device
    canonical_mastery: list[MasteryRecord]
    ruleset_version: str
    next_decision: Optional[Decision] = None


# --------------------------------------------------------------------------- #
# Packs
# --------------------------------------------------------------------------- #
class PackManifest(BaseModel):
    pack_id: PackId
    version: str
    content_version: str
    language: Literal["or", "en"] = "or"
    byte_size: int
    checksum_sha256: str
    # Integrity of the actually-served .srt.tar.gz download. The archive's
    # inner copy of the manifest carries these blank (they cover the archive
    # itself); the standalone JSON manifest carries the real values.
    archive_sha256: str = ""
    archive_byte_size: int = 0
    min_app_version: str
    chapters: list[ChapterId]
    licence: str
    source_refs: list[str] = Field(default_factory=list)
    created_at: int


class PackDownloadInfo(BaseModel):
    pack_id: PackId
    version: str
    url: str
    byte_size: int
    checksum_sha256: str
    archive_sha256: str = ""
    archive_byte_size: int = 0


# --------------------------------------------------------------------------- #
# Typed tool error (LangGraph)
# --------------------------------------------------------------------------- #
class ToolError(BaseModel):
    error_code: str
    detail: str = ""
    provider: Optional[str] = None
    model_id: Optional[str] = None
    retryable: bool = False


# --------------------------------------------------------------------------- #
# API responses
# --------------------------------------------------------------------------- #
class LearnerState(BaseModel):
    learner_id: LearnerId
    device_id: DeviceId
    mastery: list[MasteryRecord]
    active_pack_versions: dict[PackId, str]
    last_decision_id: Optional[str] = None
    outbox_depth: int = 0


class HealthResponse(BaseModel):
    status: str
    project: str = "SAARTHI"
    app_version: str
    env: str
    persistence: str
    translation_provider: str
    llm_provider: str
    retrieval_provider: str
    ruleset_version: str
    has_hf_token: bool
    has_llm_key: bool
    request_id: str


__all__ = [
    # ids
    "LearnerId", "DeviceId", "ConceptId", "ChapterId", "ChunkId", "QuestionId", "PackId",
    "new_request_id", "new_learner_id", "new_device_id", "new_decision_id",
    "new_event_id", "new_session_id",
    # enums
    "NetworkState", "Action", "DeliveryMode", "BackgroundAction",
    "EventType", "EvidenceType", "Outcome",
    # learner
    "LearnerProfileCreate", "LearnerProfile", "DeviceRegistration",
    "DeviceToken", "AuthResponse",
    # curriculum
    "GlossaryEntry", "Concept", "Chunk", "Question", "Chapter",
    # env/mastery/event
    "EnvironmentSnapshot", "MasteryRecord", "LearnerEvent",
    # assessment
    "AssessmentSubmission", "AssessmentResult",
    # decision/trace
    "Decision", "TraceStep", "DecisionTrace",
    # doubt/retrieval/generation/translation
    "DoubtRequest", "RetrievedChunk", "RetrievedResult",
    "GeneratedAnswer", "DoubtResponse", "ToolError",
    # sync
    "SyncRequest", "PerEventResult", "SyncResponse",
    # pack
    "PackManifest", "PackDownloadInfo",
    # api
    "LearnerState", "HealthResponse",
]
