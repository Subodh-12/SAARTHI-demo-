// Auto-generated from backend Pydantic schemas + ruleset.
// Do NOT edit by hand. Regenerate via `python scripts/gen_types.py`.

export enum NetworkState {
  ONLINE = "online",
  WEAK = "weak",
  OFFLINE = "offline",
  RECONNECTED = "reconnected",
}

export enum Action {
  REMEDIATE = "REMEDIATE",
  RETRY = "RETRY",
  REVISE = "REVISE",
  ADVANCE = "ADVANCE",
}

export enum DeliveryMode {
  RICH = "rich",
  CACHED = "cached",
  PREFETCH_THEN_OFFLINE = "prefetch_then_offline",
}

export enum BackgroundAction {
  SYNC = "SYNC",
  PREFETCH = "PREFETCH",
}

export enum EventType {
  LESSON_OPENED = "lesson_opened",
  LESSON_COMPLETED = "lesson_completed",
  CHUNK_VIEWED = "chunk_viewed",
  MCQ_ANSWERED = "mcq_answered",
  SHORT_ANSWER_ATTEMPTED = "short_answer_attempted",
  DOUBT_ASKED = "doubt_asked",
  NEXT_ACTION_SHOWN = "next_action_shown",
  PACK_INSTALLED = "pack_installed",
  SYNC_ACKED = "sync_acked",
}

export enum EvidenceType {
  CORRECT = "correct",
  INCORRECT = "incorrect",
  PARTIAL = "partial",
  NONE = "none",
}

export enum Outcome {
  ACCEPTED = "accepted",
  DUPLICATE = "duplicate",
  RETRYABLE = "retryable",
  REJECTED = "rejected",
}

export interface Problem {
  type: string;
  title: string;
  status: number;
  detail: string;
  error_code: string;
  request_id: string;
  decision_id?: string | null;
  instance?: string | null;
}

export interface LearnerProfileCreate {
  display_label?: string;
  locale?: "or" | "en";
  grade?: "class9";
  subject?: "science";
  pin_hash?: string | null;
}

export interface LearnerProfile extends LearnerProfileCreate {
  learner_id: string;
  created_at: number;
}

export interface AuthResponse {
  learner_id: string;
  device_id: string;
  device_token: string;
  token_expires_at: number;
}

export interface GlossaryEntry {
  term_or: string;
  term_en: string;
  definition_or: string;
  definition_en: string;
}

export interface Concept {
  concept_id: string;
  title_or: string;
  title_en: string;
  chapter_id: string;
  prerequisites: string[];
  summary_or: string;
  source_refs: string[];
}

export interface Chunk {
  chunk_id: string;
  concept_id: string;
  chapter_id: string;
  ordinal: number;
  text_or: string;
  source_ref: string;
  glossary_refs: string[];
}

export interface Question {
  question_id: string;
  concept_id: string;
  chapter_id: string;
  qtype: "mcq" | "short_answer";
  prompt_or: string;
  options: string[];
  correct_option?: number | null;
  rubric_or?: string | null;
  expected_concepts: string[];
  explanation_or: string;
  difficulty: "easy" | "medium" | "hard";
  misconception_tag?: string | null;
  source_ref: string;
}

export interface Chapter {
  chapter_id: string;
  subject: "science";
  grade: "class9";
  title_or: string;
  title_en: string;
  summary_or: string;
  source_refs: string[];
}

export interface EnvironmentSnapshot {
  network: NetworkState;
  measured_rt_ms?: number | null;
  measured_loss?: number | null;
  battery_saver: boolean;
  free_storage_bytes?: number | null;
  installed_pack_versions: Record<string, string>;
  ruleset_version: string;
}

export interface MasteryRecord {
  concept_id: string;
  p_known: number;
  band: "unstarted" | "novice" | "developing" | "proficient" | "mastered";
  attempts: number;
  correct: number;
  last_updated_event_seq?: number | null;
}

export interface LearnerEvent {
  event_id: string;
  device_id: string;
  seq: number;
  learner_id: string;
  ts: number;
  event_type: EventType;
  concept_id?: string | null;
  chapter_id?: string | null;
  question_id?: string | null;
  payload: Record<string, any>;
  outbox_state: "pending" | "inflight" | "acked" | "dead";
  retry_count: number;
}

export interface AssessmentSubmission {
  question_id: string;
  selected_option?: number | null;
  answer_text?: string | null;
  duration_ms: number;
  submitted_at: number;
  evidence: EvidenceType;
}

export interface AssessmentResult {
  question_id: string;
  correct: boolean;
  evidence: EvidenceType;
  explanation_or: string;
  concept_id: string;
  mastery_after: MasteryRecord;
  next_decision_id: string;
}

export interface Decision {
  decision_id: string;
  learner_id: string;
  ruleset_version: string;
  target_concept_id: string;
  action: Action;
  delivery_mode: DeliveryMode;
  background_actions: BackgroundAction[];
  reason_code: string;
  reason_or: string;
  chapter_id: string;
  suggested_question_id?: string | null;
  suggested_chunk_id?: string | null;
  network: NetworkState;
  produced_by: "local_engine" | "server_engine";
  created_at: number;
}

export interface TraceStep {
  step_id: string;
  node: string;
  tool?: string | null;
  provider?: string | null;
  ruleset_version?: string | null;
  model_id?: string | null;
  status: "ok" | "error" | "skipped" | "fallback";
  error_code?: string | null;
  duration_ms: number;
  retry?: number | null;
  fallback?: string | null;
  input_summary: Record<string, any>;
  output_summary: Record<string, any>;
  redacted: boolean;
}

export interface DecisionTrace {
  decision_id: string;
  trace: TraceStep[];
}

export interface DoubtRequest {
  query: string;
  learner_id: string;
  pack_ids: string[];
}

export interface RetrievedChunk {
  chunk_id: string;
  concept_id: string;
  chapter_id: string;
  text_or: string;
  source_ref: string;
  score: number;
  matched_terms: string[];
}

export interface RetrievedResult {
  chunks: RetrievedChunk[];
  provider: string;
  model_id?: string | null;
  confidence: number;
}

export interface GeneratedAnswer {
  text_or: string;
  citations: string[];
  confidence: number;
  provenance: "extractive" | "llm_grounded" | "basic";
  basic_answer_status?: string | null;
}

export interface DoubtResponse {
  answer: GeneratedAnswer;
  retrieved: RetrievedResult;
  decision_id: string;
  translated_query?: string | null;
  used_translation_tool: boolean;
}

export interface SyncRequest {
  device_id: string;
  learner_id: string;
  from_seq: number;
  events: LearnerEvent[];
}

export interface PerEventResult {
  event_id: string;
  seq: number;
  outcome: Outcome;
  detail: string;
}

export interface SyncResponse {
  accepted: PerEventResult[];
  server_learner_seq: number;
  canonical_mastery: MasteryRecord[];
  ruleset_version: string;
  next_decision?: Decision | null;
}

export interface PackManifest {
  pack_id: string;
  version: string;
  content_version: string;
  language: "or" | "en";
  byte_size: number;
  checksum_sha256: string;
  min_app_version: string;
  chapters: string[];
  licence: string;
  source_refs: string[];
  created_at: number;
}

export interface PackDownloadInfo {
  pack_id: string;
  version: string;
  url: string;
  byte_size: number;
  checksum_sha256: string;
}

export interface LearnerState {
  learner_id: string;
  device_id: string;
  mastery: MasteryRecord[];
  active_pack_versions: Record<string, string>;
  last_decision_id?: string | null;
  outbox_depth: number;
}

export interface HealthResponse {
  status: string;
  project: string;
  app_version: string;
  env: string;
  persistence: string;
  translation_provider: string;
  llm_provider: string;
  retrieval_provider: string;
  ruleset_version: string;
  has_hf_token: boolean;
  has_llm_key: boolean;
  request_id: string;
}

export interface ToolError {
  error_code: string;
  detail: string;
  provider?: string | null;
  model_id?: string | null;
  retryable: boolean;
}
