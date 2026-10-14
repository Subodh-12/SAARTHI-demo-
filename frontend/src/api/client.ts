// Centralised API client — typed contracts, timeouts, typed errors.
// All components use this; no scattered `fetch` in components.

import {
  AuthResponse, DoubtRequest, DoubtResponse, HealthResponse,
  LearnerProfile, LearnerProfileCreate, PackManifest, PackDownloadInfo,
  Decision, DecisionTrace, AssessmentSubmission, AssessmentResult,
  SyncRequest, SyncResponse, LearnerState, Problem,
} from "../generated/api";
import { Outcome } from "../generated/api";

const DEFAULT_TIMEOUT_MS = 10_000;

export class SaarthiApiError extends Error {
  constructor(public problem: Problem | null, message: string) {
    super(message);
  }
  get error_code(): string | undefined { return this.problem?.error_code; }
  get request_id(): string | undefined { return this.problem?.request_id; }
}

function getToken(): string | null {
  const raw = localStorage.getItem("saarthi.device_token");
  return raw;
}
function setToken(t: string | null) {
  if (t) localStorage.setItem("saarthi.device_token", t);
  else localStorage.removeItem("saarthi.device_token");
}
function getDeviceId(): string | null {
  return localStorage.getItem("saarthi.device_id");
}
function setDeviceId(d: string | null) {
  if (d) localStorage.setItem("saarthi.device_id", d);
  else localStorage.removeItem("saarthi.device_id");
}

async function request<T>(
  path: string, opts: RequestInit = {}, timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<T> {
  const url = `${import.meta.env.VITE_API_URL || "http://127.0.0.1:8000"}${path}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const token = getToken();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts.headers as Record<string, string> | undefined),
  };
  if (token) headers["Authorization"] = `Bearer ${token}`;
  const deviceId = getDeviceId();
  if (deviceId) headers["X-Device-Id"] = deviceId;
  try {
    const resp = await fetch(url, { ...opts, headers, signal: ctrl.signal });
    if (!resp.ok) {
      let problem: Problem | null = null;
      try { problem = await resp.json(); } catch { /* ignore */ }
      throw new SaarthiApiError(problem, `HTTP ${resp.status}`);
    }
    return await resp.json() as T;
  } catch (e: any) {
    if (e.name === "AbortError") {
      throw new SaarthiApiError(null, "Request timed out");
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// --------------------------------------------------------------------------- //
// API surface
// --------------------------------------------------------------------------- //
export const api = {
  setAuth: (token: string, deviceId: string) => { setToken(token); setDeviceId(deviceId); },
  clearAuth: () => { setToken(null); setDeviceId(null); },

  health: () => request<HealthResponse>("/api/v1/health"),

  createLearner: (body: LearnerProfileCreate) =>
    request<AuthResponse>("/api/v1/learners", {
      method: "POST", body: JSON.stringify(body),
    }),
  getCurrentLearner: () =>
    request<LearnerProfile>("/api/v1/learners/me"),
  activateLearner: (learner_id: string) =>
    request<AuthResponse>(`/api/v1/learners/${learner_id}/activate`, { method: "POST" }),
  renewToken: () =>
    request<AuthResponse>("/api/v1/learners/auth/renew", { method: "POST" }),

  listChapters: () => request("/api/v1/content/chapters"),
  getConcept: (cid: string) => request(`/api/v1/content/concepts/${cid}`),
  listChunksForConcept: (cid: string) =>
    request(`/api/v1/content/concepts/${cid}/chunks`),
  getChunk: (cid: string) => request(`/api/v1/content/chunks/${cid}`),
  getNextQuestion: (cid: string, difficulty?: string) =>
    request(`/api/v1/content/concepts/${cid}/questions/next${difficulty ? `?difficulty=${difficulty}` : ""}`),

  submitAssessment: (sub: AssessmentSubmission, seq: number) =>
    request<AssessmentResult>("/api/v1/assessments", {
      method: "POST",
      body: JSON.stringify(sub),
      headers: { "X-Event-Seq": String(seq) },
    }),

  nextDecision: (network: "online" | "weak" | "offline" | "reconnected" = "online") =>
    request<Decision>("/api/v1/decisions/next", {
      method: "POST",
      body: JSON.stringify({ network }),
    }),
  getDecision: (id: string) => request<Decision>(`/api/v1/decisions/${id}`),
  getDecisionTrace: (id: string) =>
    request<DecisionTrace>(`/api/v1/decisions/${id}/trace`),

  askDoubt: (req: DoubtRequest) =>
    request<DoubtResponse>("/api/v1/doubts/query", {
      method: "POST",
      body: JSON.stringify(req),
    }),

  sync: (req: SyncRequest) =>
    request<SyncResponse>("/api/v1/sync", {
      method: "POST",
      body: JSON.stringify(req),
      // sync can take longer; allow 20s
    }, 20_000),

  listPackManifests: () => request<PackManifest[]>("/api/v1/packs/manifest"),
  getPackDownloadInfo: (pack_id: string, version: string) =>
    request<PackDownloadInfo>(`/api/v1/packs/${pack_id}/versions/${version}`),

  getLearnerState: () => request<LearnerState>("/api/v1/state"),
};

export { Outcome };
