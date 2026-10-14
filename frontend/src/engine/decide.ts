// Deterministic decision engine — TypeScript mirror of backend/app/domain/decide.py
// Consumes the SAME packages/ruleset/rules.json as the Python engine.
// Both implementations must pass the exact same test vectors.

import { Action, BackgroundAction, DeliveryMode, NetworkState } from "../generated/api";
import rulesetRaw from "../generated/ruleset.json";

export interface Ruleset {
  ruleset_version: string;
  bkt: any;
  mastery: any;
  actions: any;
  repetition_guard: any;
  target_selection: any;
  network: any;
  delivery: any;
  background_actions: any;
  retries: any;
  sync: any;
  pack: any;
  prefetch: any;
  orchestration: any;
  translation: any;
  retrieval: any;
  generation: any;
  validation: any;
}

export const RULESET: Ruleset = rulesetRaw as Ruleset;

export interface MasteryEntry { p: number; band: string; attempts: number; correct: number; }
export interface RecentEvent { concept_id?: string; payload?: { last_action?: string }; }

export interface DecisionInput {
  trigger_event_type: string;
  trigger_concept_id: string | null;
  trigger_evidence: "correct" | "incorrect" | "partial" | "none";
  mastery: Record<string, MasteryEntry>;
  recent_events: RecentEvent[];
  prereqs: Record<string, string[]>;
  env_network: NetworkState;
  installed_pack_versions: Record<string, string>;
  ruleset_version: string;
  concept_order: string[];
  suggested_chunk_id?: string | null;
  suggested_question_id?: string | null;
  chapter_id_for_concept?: Record<string, string>;
}

export interface DecisionOutput {
  action: Action;
  delivery_mode: DeliveryMode;
  background_actions: BackgroundAction[];
  target_concept_id: string;
  chapter_id: string;
  reason_code: string;
  reason_or: string;
  suggested_chunk_id?: string | null;
  suggested_question_id?: string | null;
}

export function masteryBand(p: number): string {
  const th = RULESET.mastery.thresholds;
  if (p < th.unstarted_lo) return "unstarted";
  if (p < th.novice_hi) return "novice";
  if (p < th.developing_hi) return "developing";
  if (p < th.proficient_hi) return "proficient";
  return "mastered";
}

export function bktParams(conceptId?: string): [number, number, number, number] {
  const p = RULESET.bkt.priors;
  const overrides = (RULESET.bkt.per_concept_overrides || {})[conceptId || ""] || {};
  return [
    overrides.default_prior ?? p.default_prior,
    overrides.default_learn ?? p.default_learn,
    overrides.default_slip ?? p.default_slip,
    overrides.default_guess ?? p.default_guess,
  ];
}

export function bktUpdate(
  pKnown: number,
  evidence: "correct" | "incorrect" | "partial" | "none",
  weight: number,
  conceptId?: string,
): number {
  const [prior, learn, slip, guess] = bktParams(conceptId);
  const bounds = RULESET.bkt.update_bounds;
  let posterior = pKnown;
  const w = Math.max(0, Math.min(1, weight));
  if (evidence === "correct") {
    const num = pKnown * (1 - slip);
    const den = pKnown * (1 - slip) + (1 - pKnown) * guess;
    posterior = den > 0 ? num / den : pKnown;
  } else if (evidence === "incorrect") {
    const num = pKnown * slip;
    const den = pKnown * slip + (1 - pKnown) * (1 - guess);
    posterior = den > 0 ? num / den : pKnown;
  } else if (evidence === "partial") {
    const num = pKnown * (1 - slip);
    const den = pKnown * (1 - slip) + (1 - pKnown) * guess;
    const posteriorCorrect = den > 0 ? num / den : pKnown;
    posterior = pKnown + (posteriorCorrect - pKnown) * w;
  }
  // learning transition
  posterior = posterior + (1 - posterior) * learn;
  // weighting for partial evidence
  posterior = pKnown + (posterior - pKnown) * (evidence === "correct" || evidence === "incorrect" ? 1 : w);
  return Math.max(bounds.min_p, Math.min(bounds.max_p, posterior));
}

function recentSameActionCount(recent: RecentEvent[], action: string): number {
  let n = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].payload?.last_action === action) n++;
    else break;
  }
  return n;
}

function recentSameConceptCount(recent: RecentEvent[], conceptId: string): number {
  let n = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    if (recent[i].concept_id === conceptId) n++;
    else break;
  }
  return n;
}

export interface ReasonMessages { [code: string]: string }

export function selectTargetConcept(
  inp: DecisionInput,
  reasonMessages: ReasonMessages = {},
): { target: string; reasonCode: string; reasonOr: string } {
  const th = RULESET.mastery.thresholds;
  const advanceThreshold = RULESET.actions.advance_threshold;
  // First pass: first unmastered with prereqs satisfied
  for (const cid of inp.concept_order) {
    const entry = inp.mastery[cid];
    if (!entry) {
      return { target: cid, reasonCode: "target.unstarted_no_prereqs_needed",
        reasonOr: reasonMessages["target.unstarted_no_prereqs_needed"] || "ନୂଆ ଧାରଣା ଆରମ୍ଭ କରିବା।" };
    }
    const { p, band } = entry;
    if (band === "mastered") continue;
    if (p >= advanceThreshold) continue;
    let ok = true;
    const prereqs = inp.prereqs[cid] || [];
    for (const pre of prereqs) {
      if (!inp.mastery[pre]) {
        return { target: pre, reasonCode: "target.prerequisite_unstarted",
          reasonOr: reasonMessages["target.prerequisite_unstarted"] || "ପ୍ରଥମ ଆଧାର ଧାରଣା ଶିଖ।" };
      }
      const preP = inp.mastery[pre].p;
      if (preP < RULESET.actions.advance_threshold) {
        return { target: pre, reasonCode: "target.prerequisite_not_mastered",
          reasonOr: reasonMessages["target.prerequisite_not_mastered"] || "ପ୍ରଥମ ଆଧାର ଧାରଣା ବଦ୍ଧ କର।" };
      }
    }
    if (ok) {
      return { target: cid, reasonCode: "target.first_unmastered_with_prereqs",
        reasonOr: reasonMessages["target.first_unmastered_with_prereqs"] || "ଏହି ଧାରଣା ଉପରେ କାମ କର।" };
    }
  }
  if (Object.keys(inp.mastery).length === 0) {
    if (inp.concept_order.length) {
      return { target: inp.concept_order[0], reasonCode: "target.fallback_first_concept",
        reasonOr: reasonMessages["target.fallback_first_concept"] || "ପ୍ରଥମ ଧାରଣା ଆରମ୍ଭ କର।" };
    }
    return { target: "", reasonCode: "target.no_concepts_available",
      reasonOr: reasonMessages["target.no_concepts_available"] || "କୌଣସି ଧାରଣା ନାହିଁ।" };
  }
  const sorted = Object.entries(inp.mastery).sort(
    (a, b) => (a[1].p - b[1].p) || a[0].localeCompare(b[0]),
  );
  const [cid, entry] = sorted[0];
  return { target: cid, reasonCode: "target.lowest_mastery_fallback",
    reasonOr: reasonMessages["target.lowest_mastery_fallback"] || "ସବୁଠା ଦୁର୍ବଳ ଧାରଣା ଉପରେ ମନ୍ଦନ କର।" };
}

export function selectAction(
  inp: DecisionInput, targetCid: string,
): { action: Action; reasonCode: string } {
  const entry = inp.mastery[targetCid] || { p: 0.4, band: "novice", attempts: 0, correct: 0 };
  const pKnown: number = entry.p;
  const th = RULESET.actions;
  const evidence = inp.trigger_evidence;
  if (evidence === "incorrect" || pKnown < th.remediate_threshold) {
    return { action: Action.REMEDIATE, reasonCode: "action.remediate_low_mastery_or_incorrect" };
  }
  if (pKnown < th.retry_threshold) {
    return { action: Action.RETRY, reasonCode: "action.retry_below_threshold" };
  }
  if (pKnown < th.revise_threshold) {
    return { action: Action.REVISE, reasonCode: "action.revise_below_threshold" };
  }
  if (pKnown >= th.advance_threshold) {
    return { action: Action.ADVANCE, reasonCode: "action.advance_mastered" };
  }
  return { action: Action.REVISE, reasonCode: "action.revise_safe_default" };
}

export function applyRepetitionGuard(
  action: Action, inp: DecisionInput,
): { action: Action; reasonCode: string } {
  const guard = RULESET.repetition_guard;
  const nSame = recentSameActionCount(inp.recent_events, action);
  if (nSame < guard.max_consecutive_same_action) {
    return { action, reasonCode: "guard.no_override" };
  }
  const escape = guard.escape_action as Action;
  const targetCid = inp.trigger_concept_id || "";
  const pKnown = (inp.mastery[targetCid] || { p: 0.4 }).p;
  const advanceThreshold = RULESET.actions.advance_threshold;
  if (escape === Action.ADVANCE && pKnown < advanceThreshold) {
    return { action: Action.REVISE, reasonCode: "guard.escape_to_revise_not_ready_to_advance" };
  }
  const nSameConcept = targetCid ? recentSameConceptCount(inp.recent_events, targetCid) : 0;
  if (nSameConcept >= guard.max_consecutive_same_concept && escape === Action.ADVANCE) {
    return { action: Action.REVISE, reasonCode: "guard.escape_loop_on_same_concept" };
  }
  return { action: escape, reasonCode: "guard.escape_action" };
}

export function selectDeliveryMode(network: NetworkState): DeliveryMode {
  // String enums do not support reverse lookup (DeliveryMode["rich"] is undefined),
  // so cast the ruleset string directly — values are validated by the enum contract.
  return (RULESET.delivery[network] || "cached") as DeliveryMode;
}

export function selectBackgroundActions(network: NetworkState): BackgroundAction[] {
  return ((RULESET.background_actions[network] || []) as string[]).map(
    (s) => s as BackgroundAction,
  );
}

const DEFAULT_REASON_OR: Record<string, string> = {
  "action.remediate_low_mastery_or_incorrect": "ଆଜି ଉତ୍ତର ଭୁଲ୍ ଥିଲା। ପୁଣି ଶିଖ।",
  "action.retry_below_threshold": "ଆଉକି ଚେଷ୍ଟା କର।",
  "action.revise_below_threshold": "ପୁଣି ରିଭିଜନ୍ କର।",
  "action.revise_safe_default": "ପୁଣି ରିଭିଜନ୍ କର।",
  "action.advance_mastered": "ସାବଧାନ! ପରବର୍ତ୍ତୀ ଧାରଣା କୁ ଯାଅ।",
  "guard.escape_to_revise_not_ready_to_advance": "ବାରମ୍ବାର ଉନ୍ନତି ପାଇଁ ରିଭିଜନ୍ କର।",
  "guard.escape_action": "ପୁଣି ରିଭିଜନ୍ କର।",
  "guard.escape_loop_on_same_concept": "ଏହି ଧାରଣା କୁ ବାରମ୍ବାର ବଦ୍ଧ କର।",
};

export function decide(
  inp: DecisionInput,
  reasonMessages: ReasonMessages = {},
): DecisionOutput {
  const { target, reasonCode, reasonOr } = selectTargetConcept(inp, reasonMessages);
  if (!target) {
    return {
      action: Action.REVISE,
      delivery_mode: selectDeliveryMode(inp.env_network),
      background_actions: selectBackgroundActions(inp.env_network),
      target_concept_id: "",
      chapter_id: "",
      reason_code: reasonCode,
      reason_or: reasonOr,
    };
  }
  const { action: a1, reasonCode: r1 } = selectAction(inp, target);
  const { action, reasonCode: r2 } = applyRepetitionGuard(a1, inp);
  const finalReasonCode = r2 !== "guard.no_override" ? r2 : r1;
  const reasonOr2 = reasonMessages[finalReasonCode] || DEFAULT_REASON_OR[finalReasonCode] || `ଆଗାମୀ କାମ: ${action}`;
  const chapterId = (inp.chapter_id_for_concept || {})[target] || "";
  return {
    action,
    delivery_mode: selectDeliveryMode(inp.env_network),
    background_actions: selectBackgroundActions(inp.env_network),
    target_concept_id: target,
    chapter_id: chapterId,
    reason_code: finalReasonCode,
    reason_or: reasonOr2,
    suggested_chunk_id: inp.suggested_chunk_id ?? null,
    suggested_question_id: inp.suggested_question_id ?? null,
  };
}
