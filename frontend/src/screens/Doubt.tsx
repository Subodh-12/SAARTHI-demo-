import { useState } from "react";
import { api, SaarthiApiError } from "../api/client";
import { db, nextSeq, recordDoubtEvent } from "../store/db";
import { DoubtResponse, NetworkState } from "../generated/api";
import { OR, t } from "../i18n/or";
import { offlineRetrieve } from "../lib/offline_retrieval";
import { getInstalledPack } from "../lib/sync";

interface Props {
  profile: { learner_id: string; device_id: string; display_label: string };
  network: NetworkState;
}

export function DoubtScreen({ profile, network }: Props) {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resp, setResp] = useState<DoubtResponse | null>(null);

  const ask = async () => {
    setLoading(true); setError(""); setResp(null);
    try {
      if (network === NetworkState.OFFLINE) {
        // Offline: use local retrieval + extractive answer
        const pack = await getInstalledPack();
        if (!pack) throw new Error("No pack installed");
        const m = JSON.parse(pack.manifest_json);
        const chunks = offlineRetrieve(query, m.chunks, m.glossary, 5);
        if (chunks.length === 0) {
          setResp({
            answer: {
              text_or: t("doubt_out_of_lessons"),
              citations: [], confidence: 0, provenance: "basic",
              basic_answer_status: "out_of_lessons",
            },
            retrieved: {
              chunks: [], provider: "offline_local", confidence: 0,
            },
            decision_id: `local_${Date.now()}`,
            translated_query: null, used_translation_tool: false,
          });
        } else {
          const top = chunks[0];
          setResp({
            answer: {
              text_or: top.text_or.slice(0, 600),
              citations: [top.chunk_id], confidence: top.score,
              provenance: "extractive", basic_answer_status: "offline_extractive",
            },
            retrieved: {
              chunks: chunks.map((c) => ({
                chunk_id: c.chunk_id, concept_id: c.concept_id,
                chapter_id: c.chapter_id, text_or: c.text_or,
                source_ref: c.source_ref, score: c.score, matched_terms: c.matched_terms,
              })), provider: "offline_local", confidence: top.score,
            },
            decision_id: `local_${Date.now()}`,
            translated_query: null, used_translation_tool: false,
          });
        }
        // Record doubt event locally (outbox)
        const seq = await nextSeq(profile.device_id, profile.learner_id);
        const eventId = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        await recordDoubtEvent(profile.learner_id, profile.device_id, eventId, seq,
                               query, `local_${Date.now()}`);
      } else {
        // Online: call the orchestration graph
        const r = await api.askDoubt({
          query, learner_id: profile.learner_id, pack_ids: [],
        });
        setResp(r);
        // Record event locally too (for offline replay / audit)
        const seq = await nextSeq(profile.device_id, profile.learner_id);
        const eventId = `evt_${crypto.randomUUID().replace(/-/g, "").slice(0, 24)}`;
        await recordDoubtEvent(profile.learner_id, profile.device_id, eventId, seq,
                               query, r.decision_id);
        // Try sync
        const { trySyncNow } = await import("../lib/sync");
        await trySyncNow();
      }
    } catch (e: any) {
      setError(e instanceof SaarthiApiError ? e.message : (e.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold mb-2 odia">{t("nav_doubt")}</h2>
        <textarea value={query} onChange={(e) => setQuery(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 mb-3 odia"
                  rows={3} placeholder={t("doubt_placeholder")} />
        <button className="btn-primary w-full" onClick={ask}
                disabled={loading || !query.trim()}>
          {loading ? t("loading") : t("doubt_ask")}
        </button>
        {error && (
          <div className="banner-err text-sm px-3 py-2 rounded mt-3">{error}</div>
        )}
      </div>
      {resp && (
        <>
          <div className="card">
            <h3 className="font-semibold mb-2 odia">{"ଉତ୍ତର"}</h3>
            <p className="odia text-sm mb-2">{resp.answer.text_or}</p>
            <div className="text-xs text-slate-500 odia">
              {resp.answer.provenance === "extractive" && "ନିର୍ଯାସ — ପାଠରୁ ସିଧା"}
              {resp.answer.provenance === "llm_grounded" && "ଲ୍ୟାବିକ — ଉଦ୍ଧୃତ"}
              {resp.answer.provenance === "basic" && "ମୌଳିକ ଉତ୍ତର"}
            </div>
            {resp.answer.citations.length > 0 && (
              <div className="text-xs text-slate-600 mt-2 odia">
                <b>{t("doubt_citations")}:</b> {resp.answer.citations.join(", ")}
              </div>
            )}
          </div>
          {resp.retrieved.chunks.length > 0 && (
            <div className="card">
              <h3 className="font-semibold mb-2 odia">{"ସ୍ରୋତ ପରିଚ୍ଛଦ"}</h3>
              <ul className="text-xs space-y-1 text-slate-600">
                {resp.retrieved.chunks.map((c) => (
                  <li key={c.chunk_id}>{c.chunk_id} · score={c.score.toFixed(2)} · {c.source_ref}</li>
                ))}
              </ul>
            </div>
          )}
          {resp.used_translation_tool && (
            <div className="card banner-info text-sm">
              {"ଟ୍ରାନ୍ସଲେସନ ଟୁଲ ବ୍ୟବହୃତ ହୋଇଥିଲା।"}
              {resp.translated_query && (
                <div className="mt-2 text-xs text-slate-700">{resp.translated_query}</div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
