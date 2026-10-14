import { useState } from "react";
import { api } from "../api/client";
import { OR, t } from "../i18n/or";
import { AuthResponse, LearnerProfileCreate } from "../generated/api";

interface Props {
  onCreated: (resp: AuthResponse) => Promise<void>;
}

export function OnboardingScreen({ onCreated }: Props) {
  const [label, setLabel] = useState("");
  const [pin, setPin] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setLoading(true); setError("");
    try {
      const create: LearnerProfileCreate = {
        display_label: label,
        locale: "or", grade: "class9", subject: "science",
      };
      const resp = await api.createLearner(create);
      await onCreated(resp);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center p-6 max-w-md mx-auto">
      <div className="card w-full">
        <h1 className="text-2xl font-bold mb-2 odia">{t("app_name")}</h1>
        <p className="text-sm text-slate-600 mb-6 odia">{t("create_profile")}</p>
        <label className="block text-sm font-medium mb-1 odia">{t("label_name")}</label>
        <input value={label} onChange={(e) => setLabel(e.target.value)}
               className="w-full border rounded-lg px-3 py-2 mb-4"
               placeholder="ନାମ (ବୈକଳପ୍ତିକ)" />
        <label className="block text-sm font-medium mb-1 odia">{t("label_pin")}</label>
        <input value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 4))}
               inputMode="numeric" className="w-full border rounded-lg px-3 py-2 mb-6"
               placeholder="••••" type="password" />
        {error && <div className="banner-err text-sm px-3 py-2 rounded mb-4">{error}</div>}
        <button className="btn-primary w-full" onClick={submit} disabled={loading}>
          {loading ? t("loading") : t("create")}
        </button>
      </div>
    </main>
  );
}
