import { useEffect, useState } from "react";
import { api } from "./api/client";
import {
  getActiveProfile, db, listRecentDecisions, OutboxEvent,
  setActiveProfile,
} from "./store/db";
import { networkMonitor } from "./lib/network";
import { startSyncLoop, trySyncNow } from "./lib/sync";
import { decide, RULESET } from "./engine/decide";
import {
  Action, BackgroundAction, DeliveryMode, NetworkState,
} from "./generated/api";
import { OR, t } from "./i18n/or";
import { OnboardingScreen } from "./screens/Onboarding";
import { HomeScreen } from "./screens/Home";
import { LessonScreen } from "./screens/Lesson";
import { DoubtScreen } from "./screens/Doubt";
import { PacksScreen } from "./screens/Packs";
import { DevTraceScreen } from "./screens/DevTrace";

type Tab = "home" | "lesson" | "doubt" | "packs" | "dev";
type Profile = { learner_id: string; device_id: string; device_token: string; display_label: string } | null;

export default function App() {
  const [profile, setProfile] = useState<Profile>(null);
  const [ready, setReady] = useState(false);
  const [tab, setTab] = useState<Tab>("home");
  const [network, setNetwork] = useState<NetworkState>(
    navigator.onLine ? NetworkState.ONLINE : NetworkState.OFFLINE,
  );
  const [outboxDepth, setOutboxDepth] = useState(0);

  useEffect(() => {
    (async () => {
      const active = await getActiveProfile();
      if (active) {
        setProfile({
          learner_id: active.learner_id, device_id: active.device_id,
          device_token: active.device_token, display_label: active.display_label,
        });
        api.setAuth(active.device_token, active.device_id);
      }
      setReady(true);
    })();
    networkMonitor.start();
    const unsub = networkMonitor.subscribe((s) => setNetwork(s));
    startSyncLoop();
    return () => { unsub(); networkMonitor.stop(); };
  }, []);

  useEffect(() => {
    if (!profile) return;
    const tick = async () => {
      const pending = await db.outbox
        .where({ device_id: profile.device_id, learner_id: profile.learner_id,
                 outbox_state: "pending" as any })
        .count();
      setOutboxDepth(pending);
    };
    tick();
    const i = setInterval(tick, 2000);
    return () => clearInterval(i);
  }, [profile]);

  if (!ready) {
    return (
      <main className="min-h-screen flex items-center justify-center">
        <p className="odia text-slate-600">{t("loading")}</p>
      </main>
    );
  }

  if (!profile) {
    return (
      <OnboardingScreen
        onCreated={async (p) => {
          const display_label = (p as any).display_label || "Student";
          await db.profiles.put({
            learner_id: p.learner_id, device_id: p.device_id,
            device_token: p.device_token, token_expires_at: p.token_expires_at,
            display_label,
            created_at: Date.now(), active: true,
          });
          // Clear other active flags (multi-profile support)
          await setActiveProfile(p.learner_id);
          api.setAuth(p.device_token, p.device_id);
          setProfile({
            learner_id: p.learner_id, device_id: p.device_id,
            device_token: p.device_token, display_label,
          });
        }}
      />
    );
  }

  const Banner = network === NetworkState.OFFLINE ? (
    <div className="banner-warn text-sm px-4 py-2 border-b">{t("network_offline_banner")}</div>
  ) : null;

  return (
    <main className="min-h-screen max-w-md mx-auto flex flex-col bg-slate-50">
      <header className="bg-saarthi-700 text-white px-4 py-3 flex items-center justify-between">
        <div>
          <div className="font-bold text-lg odia">{t("app_name")}</div>
          <div className="text-xs opacity-80 odia">{t("app_tagline")}</div>
        </div>
        <div className="text-right">
          <div className="text-xs opacity-80 odia">{profile.display_label}</div>
          <NetworkBadge state={network} />
        </div>
      </header>
      {Banner}
      <section className="flex-1 overflow-y-auto p-4">
        {tab === "home" && (
          <HomeScreen profile={profile} network={network}
                      onNavigate={setTab} outboxDepth={outboxDepth} />
        )}
        {tab === "lesson" && (
          <LessonScreen profile={profile} network={network} />
        )}
        {tab === "doubt" && (
          <DoubtScreen profile={profile} network={network} />
        )}
        {tab === "packs" && (
          <PacksScreen />
        )}
        {tab === "dev" && (
          <DevTraceScreen profile={profile} />
        )}
      </section>
      <nav className="bg-white border-t border-slate-200 grid grid-cols-5 text-xs text-slate-700">
        <TabBtn label={t("nav_home")} active={tab === "home"} onClick={() => setTab("home")} icon="🏠" />
        <TabBtn label={t("nav_lesson")} active={tab === "lesson"} onClick={() => setTab("lesson")} icon="📖" />
        <TabBtn label={t("nav_doubt")} active={tab === "doubt"} onClick={() => setTab("doubt")} icon="?" />
        <TabBtn label={t("nav_packs")} active={tab === "packs"} onClick={() => setTab("packs")} icon="📦" />
        <TabBtn label={t("nav_dev")} active={tab === "dev"} onClick={() => setTab("dev")} icon="🔧" />
      </nav>
    </main>
  );
}

function TabBtn({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon: string }) {
  return (
    <button onClick={onClick}
      className={`flex flex-col items-center justify-center py-2 gap-0.5
        ${active ? "text-saarthi-700 font-semibold" : "text-slate-500"}`}>
      <span className="text-base">{icon}</span>
      <span className="odia">{label}</span>
    </button>
  );
}

function NetworkBadge({ state }: { state: NetworkState }) {
  const text = state === NetworkState.ONLINE ? t("state_online")
    : state === NetworkState.WEAK ? t("state_weak")
    : state === NetworkState.OFFLINE ? t("state_offline")
    : t("state_syncing");
  return <div className="text-xs odia">{text}</div>;
}
