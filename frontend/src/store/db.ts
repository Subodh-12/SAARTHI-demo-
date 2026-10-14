// IndexedDB store (Dexie) — local profiles, mastery snapshot, packs,
// outbox events, decisions, traces. State mutations + their outbox event
// are written in ONE transaction (atomic). Never rely on React state alone
// for learner progress.

import Dexie, { Table } from "dexie";
import {
  Action, BackgroundAction, DeliveryMode, EventType,
  LearnerEvent, MasteryRecord, NetworkState, Outcome,
} from "../generated/api";

export interface LocalProfile {
  learner_id: string;
  device_id: string;
  device_token: string;
  token_expires_at: number;
  display_label: string;
  created_at: number;
  active: boolean;
  pin_hash?: string;
}

export interface LocalPack {
  pack_id: string;
  version: string;
  byte_size: number;
  checksum_sha256: string;
  installed_at: number;
  manifest_json: string;  // full pack payload (chapters, concepts, chunks, questions)
}

export interface LocalMastery {
  concept_id: string;
  p_known: number;
  band: string;
  attempts: number;
  correct: number;
  last_updated_event_seq?: number | null;
}

export interface LocalDecision {
  decision_id: string;
  action: Action;
  delivery_mode: DeliveryMode;
  background_actions: BackgroundAction[];
  target_concept_id: string;
  chapter_id: string;
  reason_code: string;
  reason_or: string;
  network: NetworkState;
  produced_by: "local_engine" | "server_engine";
  created_at: number;
  trace_json?: string;
}

export interface OutboxEvent {
  event_id: string;  // primary key — idempotent
  device_id: string;
  learner_id: string;
  seq: number;
  ts: number;
  event_type: EventType;
  concept_id?: string | null;
  chapter_id?: string | null;
  question_id?: string | null;
  payload: Record<string, any>;
  outbox_state: "pending" | "inflight" | "acked" | "dead";
  retry_count: number;
}

class SaarthiDB extends Dexie {
  profiles!: Table<LocalProfile, string>;
  packs!: Table<LocalPack, string>;
  mastery!: Table<LocalMastery, string>;
  decisions!: Table<LocalDecision, string>;
  outbox!: Table<OutboxEvent, string>;

  constructor() {
    super("saarthi");
    this.version(1).stores({
      profiles: "learner_id, device_id, active",
      packs: "pack_id, version",
      mastery: "concept_id",
      decisions: "decision_id, created_at",
      outbox: "event_id, device_id, learner_id, seq, outbox_state",
    });
  }
}

export const db = new SaarthiDB();

// --------------------------------------------------------------------------- //
// Atomic event write — state mutation + outbox event in one transaction
// --------------------------------------------------------------------------- //
export async function recordAssessmentEvent(
  learner_id: string, device_id: string, event_id: string, seq: number,
  concept_id: string, chapter_id: string, question_id: string,
  evidence: "correct" | "incorrect" | "partial" | "none",
  correct: boolean, selected_option?: number, answer_text?: string,
  duration_ms: number = 0,
): Promise<void> {
  const ev: OutboxEvent = {
    event_id, device_id, learner_id, seq,
    ts: Date.now(),
    event_type: evidence === "none" ? EventType.LESSON_OPENED
              : (answer_text !== undefined ? EventType.SHORT_ANSWER_ATTEMPTED
                                          : EventType.MCQ_ANSWERED),
    concept_id, chapter_id, question_id,
    payload: { evidence, weight: 1.0, correct, selected_option, answer_text, duration_ms, last_action: "ASSESS" },
    outbox_state: "pending", retry_count: 0,
  };
  await db.transaction("rw", db.outbox, db.mastery, async () => {
    // Update local mastery (BKT — same pure function as Python)
    const { bktUpdate, masteryBand } = await import("../engine/decide");
    const RULESET = (await import("../engine/decide")).RULESET;
    const existing = await db.mastery.get(concept_id);
    const pPrior = existing?.p_known ?? RULESET.bkt.priors.default_prior;
    const pNew = bktUpdate(pPrior, evidence as any, 1.0, concept_id);
    const band = masteryBand(pNew);
    await db.mastery.put({
      concept_id, p_known: pNew, band,
      attempts: (existing?.attempts ?? 0) + 1,
      correct: (existing?.correct ?? 0) + (correct ? 1 : 0),
      last_updated_event_seq: seq,
    });
    await db.outbox.put(ev);
  });
}

export async function recordDoubtEvent(
  learner_id: string, device_id: string, event_id: string, seq: number,
  query: string, decision_id: string,
): Promise<void> {
  // Doubt events do NOT update mastery (evidence=none).
  const ev: OutboxEvent = {
    event_id, device_id, learner_id, seq, ts: Date.now(),
    event_type: EventType.DOUBT_ASKED,
    payload: { query, decision_id, evidence: "none", weight: 0.0, last_action: "DOUBT" },
    outbox_state: "pending", retry_count: 0,
  };
  await db.outbox.put(ev);
}

export async function nextSeq(device_id: string, learner_id: string): Promise<number> {
  // Highest existing seq across pending+inflight+acked for this device+learner.
  const events = await db.outbox
    .where({ device_id, learner_id }).toArray();
  if (!events.length) return 1;
  return Math.max(...events.map((e) => e.seq)) + 1;
}

export async function listPendingOutbox(
  device_id: string, learner_id: string, limit: number = 100,
): Promise<OutboxEvent[]> {
  return db.outbox
    .where({ device_id, learner_id, outbox_state: "pending" })
    .sortBy("seq")
    .then((arr) => arr.slice(0, limit));
}

export async function markOutboxAcked(
  device_id: string, learner_id: string,
  acked: { event_id: string; outcome: Outcome }[],
): Promise<void> {
  await db.transaction("rw", db.outbox, async () => {
    for (const r of acked) {
      if (r.outcome === Outcome.ACCEPTED || r.outcome === Outcome.DUPLICATE) {
        await db.outbox.update(r.event_id, { outbox_state: "acked" });
      } else if (r.outcome === Outcome.REJECTED) {
        await db.outbox.update(r.event_id, { outbox_state: "dead" });
      } else {
        // RETRYABLE — keep pending, increment retry_count
        const ev = await db.outbox.get(r.event_id);
        if (ev) {
          await db.outbox.put({ ...ev, retry_count: ev.retry_count + 1 });
        }
      }
    }
  });
}

export async function getActiveProfile(): Promise<LocalProfile | undefined> {
  return db.profiles.where("active").equals(1 as any).first() as Promise<LocalProfile | undefined>;
}

export async function setActiveProfile(learner_id: string): Promise<void> {
  await db.transaction("rw", db.profiles, async () => {
    const all = await db.profiles.toArray();
    for (const p of all) {
      await db.profiles.update(p.learner_id, { active: p.learner_id === learner_id });
    }
  });
}

export async function getMasterySnapshot(): Promise<LocalMastery[]> {
  return db.mastery.toArray();
}

export async function replaceMasteryFromSync(snapshot: LocalMastery[]): Promise<void> {
  await db.transaction("rw", db.mastery, async () => {
    await db.mastery.clear();
    for (const m of snapshot) await db.mastery.put(m);
  });
}

export async function recordDecision(d: LocalDecision): Promise<void> {
  await db.decisions.put(d);
}

export async function listRecentDecisions(limit: number = 5): Promise<LocalDecision[]> {
  return db.decisions.orderBy("created_at").reverse().limit(limit).toArray();
}
