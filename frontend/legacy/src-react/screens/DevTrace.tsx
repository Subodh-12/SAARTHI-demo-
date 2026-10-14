import { useEffect, useState } from "react";
import { api } from "../api/client";
import { listRecentDecisions, LocalDecision } from "../store/db";
import { DecisionTrace } from "../generated/api";
import { OR, t } from "../i18n/or";

interface Props {
  profile: { learner_id: string; device_id: string; display_label: string };
}

export function DevTraceScreen({ profile }: Props) {
  const [decisions, setDecisions] = useState<LocalDecision[]>([]);
  const [trace, setTrace] = useState<DecisionTrace | null>(null);
  const [selectedDecision, setSelectedDecision] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    listRecentDecisions(20).then(setDecisions);
  }, []);

  const loadTrace = async (decision_id: string) => {
    setSelectedDecision(decision_id); setTrace(null); setError("");
    try {
      if (decision_id.startsWith("local_")) {
        setTrace({ decision_id, trace: [] });
      } else {
        const t = await api.getDecisionTrace(decision_id);
        setTrace(t);
      }
    } catch (e: any) {
      setError(e.message || String(e));
    }
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold mb-2 odia">{t("dev_trace_title")}</h2>
        <div className="text-xs text-slate-500 mb-3">
          {decisions.length} recent decisions (most recent first)
        </div>
        <ul className="text-xs space-y-1">
          {decisions.map((d) => (
            <li key={d.decision_id}>
              <button
                className={`text-left w-full p-2 rounded hover:bg-slate-50
                  ${selectedDecision === d.decision_id ? "bg-saarthi-50" : ""}`}
                onClick={() => loadTrace(d.decision_id)}
              >
                <div className="font-mono text-[10px] text-slate-500">{d.decision_id}</div>
                <div className="odia">
                  {d.action} · {d.target_concept_id} · {d.reason_code}
                </div>
                <div className="text-[10px] text-slate-500">
                  {d.produced_by} · {d.network} · {new Date(d.created_at).toLocaleString()}
                </div>
              </button>
            </li>
          ))}
        </ul>
      </div>

      {error && (
        <div className="card">
          <div className="banner-err text-sm px-3 py-2 rounded">{error}</div>
        </div>
      )}

      {trace && (
        <div className="card">
          <h3 className="font-semibold mb-2">Trace: {trace.decision_id}</h3>
          {trace.trace.length === 0 ? (
            <p className="text-sm text-slate-500 odia">
              {"ଏହି ନିଷ୍ପତ୍ତି ସ୍ଥାନୀୟ ଇଞ୍ଜିନରୁ — ଟ୍ରେସ ନାହିଁ।"}
            </p>
          ) : (
            <ol className="text-xs space-y-2">
              {trace.trace.map((step, i) => (
                <li key={step.step_id} className="border-l-2 border-saarthi-300 pl-3">
                  <div className="font-mono text-[10px] text-slate-500">
                    #{i+1} {step.node} {step.tool && `· ${step.tool}`} {step.provider && `· ${step.provider}`}
                  </div>
                  <div className="odia">
                    Status: <b>{step.status}</b> · {step.duration_ms}ms
                    {step.error_code && ` · ${step.error_code}`}
                    {step.fallback && ` · fallback=${step.fallback}`}
                  </div>
                  {step.input_summary && Object.keys(step.input_summary).length > 0 && (
                    <div className="text-[10px] text-slate-500 mt-1">
                      in: {JSON.stringify(step.input_summary)}
                    </div>
                  )}
                  {step.output_summary && Object.keys(step.output_summary).length > 0 && (
                    <div className="text-[10px] text-slate-500">
                      out: {JSON.stringify(step.output_summary)}
                    </div>
                  )}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </div>
  );
}
