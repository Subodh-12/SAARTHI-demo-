import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { decide, DecisionInput, RULESET, REASON_MESSAGES } from "../src/engine/decide";
import { Action, BackgroundAction, DeliveryMode, NetworkState } from "../src/generated/api";

const fixturePath = resolve(__dirname, "../../tests/fixtures/rule_vectors.json");
const fixture = JSON.parse(readFileSync(fixturePath, "utf-8"));

interface RawInput {
  trigger_event_type: string;
  trigger_concept_id: string | null;
  trigger_evidence: "correct" | "incorrect" | "partial" | "none";
  mastery: Record<string, { p: number; band: string; attempts: number; correct: number }>;
  recent_events: any[];
  prereqs: Record<string, string[]>;
  env_network: string;
  installed_pack_versions: Record<string, string>;
  ruleset_version: string;
  concept_order: string[];
  chapter_id_for_concept: Record<string, string>;
  suggested_chunk_id?: string | null;
  suggested_question_id?: string | null;
}

function toInput(v: RawInput): DecisionInput {
  return {
    trigger_event_type: v.trigger_event_type,
    trigger_concept_id: v.trigger_concept_id,
    trigger_evidence: v.trigger_evidence,
    mastery: v.mastery,
    recent_events: v.recent_events,
    prereqs: v.prereqs,
    env_network: NetworkState[v.env_network.toUpperCase() as keyof typeof NetworkState],
    installed_pack_versions: v.installed_pack_versions,
    ruleset_version: v.ruleset_version,
    concept_order: v.concept_order,
    chapter_id_for_concept: v.chapter_id_for_concept,
    suggested_chunk_id: v.suggested_chunk_id ?? null,
    suggested_question_id: v.suggested_question_id ?? null,
  };
}

describe("rule vectors (TS mirror)", () => {
  it("ruleset version matches fixture", () => {
    expect(fixture.ruleset_version).toBe(RULESET.ruleset_version);
  });

  it.each(fixture.vectors.map((v: any, i: number) => ({ v, i })))(
    "vector #$i returns the expected action",
    ({ v }: { v: any }) => {
      const out = decide(toInput(v.input as RawInput), fixture.reason_messages);
      const expected = v.expected;
      expect(out.action).toBe(expected.action as Action);
      expect(out.delivery_mode).toBe(expected.delivery_mode as DeliveryMode);
      expect(out.background_actions.map((a) => a)).toEqual(expected.background_actions);
      expect(out.target_concept_id).toBe(expected.target_concept_id);
      expect(out.chapter_id).toBe(expected.chapter_id);
      expect(out.reason_code).toBe(expected.reason_code);
      expect(out.reason_or).toBe(expected.reason_or);
    },
  );

  it("runs at least 200 vectors", () => {
    expect(fixture.vectors.length).toBeGreaterThanOrEqual(200);
  });
});
