import { useEffect, useState } from "react";
import { api } from "../api/client";
import { db } from "../store/db";
import { PackManifest, PackDownloadInfo } from "../generated/api";
import { OR, t } from "../i18n/or";
import { packInstallAvailable, getInstalledPack } from "../lib/sync";

export function PacksScreen() {
  const [manifests, setManifests] = useState<PackManifest[]>([]);
  const [installed, setInstalled] = useState<{ pack_id: string; version: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    void load();
  }, []);

  const load = async () => {
    setLoading(true); setError("");
    try {
      const ms = await api.listPackManifests();
      setManifests(ms);
      const inst = await getInstalledPack();
      setInstalled(inst ? { pack_id: inst.pack_id, version: inst.version } : null);
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setLoading(false);
    }
  };

  const install = async (m: PackManifest) => {
    setBusy(m.pack_id); setError("");
    try {
      const info = await api.getPackDownloadInfo(m.pack_id, m.version);
      const ok = await packInstallAvailable(m.pack_id, m.version, info.byte_size, info.checksum_sha256);
      if (!ok) throw new Error("Install failed (checksum or download error)");
      await load();
    } catch (e: any) {
      setError(e.message || String(e));
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="card odia">{t("loading")}</div>;

  return (
    <div className="space-y-4">
      <div className="card">
        <h2 className="font-semibold mb-2 odia">{t("nav_packs")}</h2>
        {error && <div className="banner-err text-sm px-3 py-2 rounded mb-3">{error}</div>}
        <ul className="space-y-3">
          {manifests.map((m) => {
            const isInstalled = installed?.pack_id === m.pack_id && installed?.version === m.version;
            return (
              <li key={`${m.pack_id}-${m.version}`} className="border rounded-lg p-3">
                <div className="font-semibold odia">{m.pack_id}</div>
                <div className="text-xs text-slate-500">v{m.version} · {(m.byte_size / 1024).toFixed(0)} KB · {m.language}</div>
                <div className="text-xs text-slate-500 mt-1">{m.licence}</div>
                {isInstalled ? (
                  <div className="banner-ok text-sm px-3 py-1 rounded mt-2 inline-block">
                    {t("packs_installed")}
                  </div>
                ) : (
                  <button className="btn-primary mt-2 text-sm" disabled={busy === m.pack_id}
                          onClick={() => install(m)}>
                    {busy === m.pack_id ? t("packs_installing") : t("packs_download")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
