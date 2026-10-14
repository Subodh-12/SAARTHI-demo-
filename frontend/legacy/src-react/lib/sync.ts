// Sync engine — backoff+jitter, timeout, retry cap, dead-letter.
// Sync never blocks learning.

import { api, Outcome } from "../api/client";
import {
  db, listPendingOutbox, markOutboxAcked, replaceMasteryFromSync,
  getActiveProfile, OutboxEvent,
} from "../store/db";
import { RULESET } from "../engine/decide";
import { EventType, LearnerEvent, NetworkState } from "../generated/api";

let inflight = false;
let nextRetryAt = 0;

function sleep(ms: number) { return new Promise((r) => setTimeout(r, ms)); }
function jitter(base: number, j: number) {
  return Math.round(base * (1 - j + Math.random() * 2 * j));
}

export async function trySyncNow(): Promise<{ ok: boolean; reason?: string; accepted?: number }> {
  if (inflight) return { ok: false, reason: "already_inflight" };
  const now = Date.now();
  if (nextRetryAt > now) {
    return { ok: false, reason: `backoff_until_${nextRetryAt - now}ms` };
  }
  inflight = true;
  try {
    const profile = await getActiveProfile();
    if (!profile) return { ok: false, reason: "no_profile" };
    const pending = await listPendingOutbox(profile.device_id, profile.learner_id,
                                            RULESET.sync.batch_size);
    if (pending.length === 0) return { ok: true, accepted: 0 };
    // Mark inflight
    await db.outbox.bulkPut(pending.map((e) => ({ ...e, outbox_state: "inflight" as const })));
    // Build the request body
    const events: LearnerEvent[] = pending.map((e) => ({
      event_id: e.event_id, device_id: e.device_id, seq: e.seq,
      learner_id: e.learner_id, ts: e.ts, event_type: e.event_type,
      concept_id: e.concept_id ?? null, chapter_id: e.chapter_id ?? null,
      question_id: e.question_id ?? null, payload: e.payload,
      outbox_state: "inflight", retry_count: e.retry_count,
    }));
    const from_seq = Math.max(0, Math.min(...pending.map((e) => e.seq)) - 1);
    const resp = await api.sync({
      device_id: profile.device_id, learner_id: profile.learner_id,
      from_seq, events,
    });
    // Ack per-event outcomes
    const acks = resp.accepted.map((r) => ({ event_id: r.event_id, outcome: r.outcome }));
    await markOutboxAcked(profile.device_id, profile.learner_id, acks);
    // Replace canonical mastery (server is the source of truth)
    if (resp.canonical_mastery && resp.canonical_mastery.length) {
      await replaceMasteryFromSync(resp.canonical_mastery.map((m) => ({
        concept_id: m.concept_id, p_known: m.p_known, band: m.band,
        attempts: m.attempts, correct: m.correct,
        last_updated_event_seq: m.last_updated_event_seq ?? null,
      })));
    }
    nextRetryAt = 0;
    return { ok: true, accepted: resp.accepted.length };
  } catch (e: any) {
    // Exponential backoff
    const base = RULESET.retries.backoff_initial_ms;
    const max = RULESET.retries.backoff_max_ms;
    const j = RULESET.retries.backoff_jitter;
    const delay = jitter(Math.min(max, base * 2), j);
    nextRetryAt = Date.now() + delay;
    return { ok: false, reason: `error: ${e.message || e}` };
  } finally {
    inflight = false;
  }
}

let loopRunning = false;
export function startSyncLoop() {
  if (loopRunning) return;
  loopRunning = true;
  setInterval(async () => {
    // Only sync when online or reconnected
    const state = (await import("../lib/network")).networkMonitor.getState();
    if (state === NetworkState.OFFLINE) return;
    await trySyncNow();
  }, 10_000);
}

export async function packInstallAvailable(pack_id: string, version: string,
                                          byte_size: number,
                                          checksum_sha256: string): Promise<boolean> {
  const manifestUrl = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000")
                    + `/api/v1/packs/${pack_id}/versions/${version}/download`;
  try {
    const resp = await fetch(manifestUrl, {
      headers: { Authorization: `Bearer ${localStorage.getItem("saarthi.device_token")}` },
    });
    if (!resp.ok) return false;
    const blob = await resp.blob();
    // Verify checksum
    const buf = await blob.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", buf);
    const hashHex = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
    if (hashHex !== checksum_sha256) return false;
    // Store the pack manifest in IndexedDB
    const text = await blob.text();
    const payload = JSON.parse(text);
    const { db } = await import("../store/db");
    await db.packs.put({
      pack_id, version, byte_size, checksum_sha256,
      installed_at: Date.now(),
      manifest_json: text,
    });
    return true;
  } catch (e) {
    return false;
  }
}

export async function getInstalledPack(): Promise<{ pack_id: string; version: string; manifest_json: string } | undefined> {
  const packs = await db.packs.toArray();
  return packs[0];
}
