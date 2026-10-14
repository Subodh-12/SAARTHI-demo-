import { useEffect, useState } from "react";
import { api, SaarthiApiError } from "../api/client";
import { db, listRecentDecisions, LocalDecision, nextSeq,
        recordAssessmentEvent, getMasterySnapshot } from "../store/db";
import { decide, RULESET, masteryBand } from "../engine/decide";
import {
  Action, BackgroundAction, Decision, DeliveryMode, LearnerEvent,
  MasteryRecord, NetworkState, Outcome,
} from "../generated/api";
import { OR, t } from "../i18n/or";
import { offlineRetrieve } from "../lib/offline_retrieval";
import { getInstalledPack } from "../lib/sync";

interface Props {
  profile: { learner_id: string; device_id: string; display_label: string };
  network: NetworkState;
  onNavigate: (t: "home" | "lesson" | "doubt" | "packs" | "dev") => void;
  outboxDepth: number;
}

export function HomeScreen({ profile, network, onNavigate, outboxDepth }: Props) {
  const [decision, setDecision] = useState<Decision | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mastery, setMastery] = useState<MasteryRecord[]>([]);
  const [recentDecisions, setRecentDecisions] = useState<LocalDecision[]>([]);

  useEffect(() => {
    void loadHome();
  }, []);

  const loadHome = async () => {
    setLoading(true); setError("");
    try {
      if (network === NetworkState.OFFLINE) {
        // Use local decision engine
        const snap = await getMasterySnapshot();
        const masteryDict: Record<string, { p: number; band: string; attempts: number; correct: number }> = {};
        for (const m of snap) masteryDict[m.concept_id] = {
          p: m.p_known, band: m.band, attempts: m.attempts, correct: m.correct,
        };
        // Concept order from installed pack
        const pack = await getInstalledPack();
        let concept_order: string[] = [];
        let chapter_for_concept: Record<string, string> = {};
        let prereqs: Record<string, string[]> = {};
        if (pack) {
          const m = JSON.parse(pack.manifest_json);
          concept_order = m.concepts.map((c: any) => c.concept_id);
          for (const c of m.concepts) {
            chapter_for_concept[c.concept_id] = c.chapter_id;
            prereqs[c.concept_id] = c.prerequisites || [];
          }
        }
        const out = decide({
          trigger_event_type: "next_action_shown",
          trigger_concept_id: null,
          trigger_evidence: "none",
          mastery: masteryDict,
          recent_events: (await db.decisions.orderBy("created_at").reverse().limit(10).toArray())
            .map((d) => ({ concept_id: d.target_concept_id, payload: { last_action: d.action } })),
          prereqs, env_network: network,
          installed_pack_versions: pack ? { [pack.pack_id]: pack.version } : {},
          ruleset_version: RULESET.ruleset_version,
          concept_order,
          chapter_id_for_concept: chapter_for_concept,
        });
        const localDecision: Decision = {
          decision_id: `local_${Date.now()}`,
          learner_id: profile.learner_id,
          ruleset_version: RULESET.ruleset_version,
          target_concept_id: out.target_concept_id,
          action: out.action, delivery_mode: out.delivery_mode,
          background_actions: out.background_actions,
          reason_code: out.reason_code, reason_or: out.reason_or,
          chapter_id: out.chapter_id,
          network, produced_by: "local_engine",
          created_at: Date.now(),
          suggested_chunk_id: out.suggested_chunk_id ?? null,
          suggested_question_id: out.suggested_question_id ?? null,
        };
        setDecision(localDecision);
        await db.decisions.put({ ...localDecision, trace_json: "[]" });
      } else {
        const d = await api.nextDecision(network);
        setDecision(d);
        await db.decisions.put({ ...d, trace_json: "[]" });
      }
      setMastery((await getMasterySnapshot()) as any);
      setRecentDecisions(await listRecentDecisions(5));
    } catch (e: any) {
      setError(e instanceof SaarthiApiError ? e.message : (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return <div className="card odia">{t("loading")}</div>;
  }
  if (error) {
    return (
      <div className="card">
        <div className="banner-err text-sm px-3 py-2 rounded mb-3">{error}</div>
        <button className="btn-secondary w-full" onClick={loadHome}>{t("retry")}</button>
      </div>
    );
  }
  if (!decision) {
    return <div className="card odia">{t("empty")}</div>;
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="text-xs text-slate-500 mb-1 odia">{t("home_next")}</div>
        <div className="text-xl font-bold mb-2">
          <ActionBadge action={decision.action} />
          <span className="ml-2 odia">{decision.reason_or}</span>
        </div>
        <div className="text-xs text-slate-600 odia">
          {t("nav_lesson")}: {decision.chapter_id} · {decision.target_concept_id}
        </div>
        <div className="text-xs text-slate-500 mt-1 odia">
          ({decision.produced_by === "local_engine" ? "ସ୍ଥାନୀୟ" : "ସର୍ଭର"} ନିଷ୍ପତ୍ତି)
        </div>
        <button className="btn-primary w-full mt-4"
                onClick={() => onNavigate("lesson")}>
          {t("lesson_read")}
        </button>
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2 odia">{t("home_mastered")}</h3>
        {mastery.length === 0 ? (
          <p className="text-sm text-slate-500 odia">{t("empty")}</p>
        ) : (
          <ul className="text-sm space-y-1">
            {mastery.map((m) => (
              <li key={m.concept_id} className="flex justify-between">
                <span>{m.concept_id}</span>
                <span>{m.band} · {(m.p_known * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold mb-2 odia">{t("home_outbox")}</h3>
        <div className="text-2xl font-bold">{outboxDepth}</div>
        <div className="text-xs text-slate-500 odia">{t("state_syncing")}</div>
        {network !== NetworkState.OFFLINE && outboxDepth > 0 && (
          <button className="btn-secondary mt-3 text-sm" onClick={async () => {
            const { trySyncNow } = await import("../lib/sync");
            await trySyncNow();
            await loadHome();
          }}>
            {t("state_syncing")}
          </button>
        )}
      </div>

      {recentDecisions.length > 0 && (
        <div className="card">
          <h3 className="font-semibold mb-2 odia">{"ଶେଷ ନିଷ୍ପତ୍ତି"}</h3>
          <ul className="text-xs space-y-1 text-slate-600">
            {recentDecisions.map((d, i) => (
              <li key={i}>{new Date(d.created_at).toLocaleString()} · {d.action} · {d.target_concept_id}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function ActionBadge({ action }: { action: Action }) {
  const map: Record<Action, string> = {
    [Action.REMEDIATE]: "🔁 ପୁନଃଶିକ୍ଷ",
    [Action.RETRY]: "✋ ପୁଣି ଚେଷ୍ଟା",
    [Action.REVISE]: "📖 ପୁନଃବିବରଣ",
    [Action.ADVANCE]: "🚀 ଆଗକୁ ଯାଅ",
  };
  return <span className="odia inline-block px-2 py-1 bg-saarthi-100 text-saarthi-800 rounded">{map[action]}</span>;
}
