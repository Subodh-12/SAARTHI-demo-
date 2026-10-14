// Measured network state with hysteresis — does not trust navigator.onLine alone.
// Records RTT samples + loss samples; classifies online/weak/offline based on
// ruleset thresholds; uses hysteresis (n consecutive samples before switching).

import { RULESET } from "../engine/decide";
import { NetworkState } from "../generated/api";

type Listener = (s: NetworkState, info: NetworkInfo) => void;

interface NetworkInfo {
  state: NetworkState;
  rt_ms: number | null;
  loss: number | null;
}

class NetworkMonitor {
  private listeners: Listener[] = [];
  private state: NetworkState = navigator.onLine ? NetworkState.ONLINE : NetworkState.OFFLINE;
  private history: { rt_ms: number; ok: boolean; ts: number }[] = [];
  private timer: number | null = null;

  start() {
    if (this.timer) return;
    window.addEventListener("online", this.onNavigatorOnline);
    window.addEventListener("offline", this.onNavigatorOffline);
    this.timer = window.setInterval(() => this.probe(), 5_000);
    this.probe();
  }
  stop() {
    if (this.timer) { clearInterval(this.timer); this.timer = null; }
    window.removeEventListener("online", this.onNavigatorOnline);
    window.removeEventListener("offline", this.onNavigatorOffline);
  }
  private onNavigatorOnline = () => this.probe();
  private onNavigatorOffline = () => this.setState(NetworkState.OFFLINE, null, 1.0);

  private async probe() {
    if (!navigator.onLine) {
      this.setState(NetworkState.OFFLINE, null, 1.0);
      return;
    }
    const api_url = (import.meta.env.VITE_API_URL || "http://127.0.0.1:8000")
                    + "/api/v1/health";
    const t0 = performance.now();
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), RULESET.network.offline_probe_timeout_ms);
      const resp = await fetch(api_url, { signal: ctrl.signal, cache: "no-store" });
      clearTimeout(timer);
      const rt = performance.now() - t0;
      this.history.push({ rt_ms: rt, ok: resp.ok, ts: Date.now() });
    } catch (e) {
      this.history.push({ rt_ms: 99999, ok: false, ts: Date.now() });
    }
    if (this.history.length > RULESET.network.hysteresis_observations + 2) {
      this.history.shift();
    }
    this.classify();
  }

  private classify() {
    const n = RULESET.network;
    if (this.history.length < 1) return;
    const recent = this.history.slice(-n.hysteresis_observations);
    let bad_rt = 0, lost = 0;
    for (const s of recent) {
      if (!s.ok) lost++;
      if (s.rt_ms > n.weak_rt_threshold_ms) bad_rt++;
    }
    const loss = recent.length ? lost / recent.length : 1;
    const avg_rt = recent.filter((s) => s.ok).reduce((a, b) => a + b.rt_ms, 0)
                     / Math.max(1, recent.filter((s) => s.ok).length);
    let target = this.state;
    if (loss >= 1.0) {
      target = NetworkState.OFFLINE;
    } else if (loss > n.weak_loss_threshold || avg_rt > n.weak_rt_threshold_ms) {
      target = NetworkState.WEAK;
    } else {
      target = NetworkState.ONLINE;
    }
    // Hysteresis: require N consecutive samples in target state before switching
    const from_online_to_weak = n.online_to_weak_after_n_bad;
    const from_weak_to_offline = n.weak_to_offline_after_n_bad;
    const from_weak_to_online = n.weak_to_online_after_n_good;
    const from_offline_to_weak = n.offline_to_weak_after_n_good;

    // Simplified hysteresis: count consecutive samples in target state
    let consecutive = 0;
    for (let i = recent.length - 1; i >= 0; i--) {
      if (this.classifySample(recent[i]) === target) consecutive++;
      else break;
    }
    let threshold = 1;
    if (this.state === NetworkState.ONLINE && target === NetworkState.WEAK) threshold = from_online_to_weak;
    if (this.state === NetworkState.WEAK && target === NetworkState.OFFLINE) threshold = from_weak_to_offline;
    if (this.state === NetworkState.WEAK && target === NetworkState.ONLINE) threshold = from_weak_to_online;
    if (this.state === NetworkState.OFFLINE && target === NetworkState.WEAK) threshold = from_offline_to_weak;
    if (consecutive < threshold) return;
    this.setState(target, avg_rt || null, loss);
  }

  private classifySample(s: { rt_ms: number; ok: boolean }): NetworkState {
    const n = RULESET.network;
    if (!s.ok) return NetworkState.OFFLINE;
    if (s.rt_ms > n.weak_rt_threshold_ms) return NetworkState.WEAK;
    return NetworkState.ONLINE;
  }

  private setState(state: NetworkState, rt_ms: number | null, loss: number) {
    if (state === this.state && rt_ms === null) return;
    const prev = this.state;
    this.state = state;
    const info: NetworkInfo = { state, rt_ms, loss };
    for (const l of this.listeners) l(state, info);
    // RECONNECTED is a transient: emit when going from OFFLINE to ONLINE/WEAK
    if (prev === NetworkState.OFFLINE && state !== NetworkState.OFFLINE) {
      // emit reconnected for one tick
      for (const l of this.listeners) l(NetworkState.RECONNECTED, info);
    }
  }

  getState(): NetworkState { return this.state; }
  subscribe(l: Listener): () => void {
    this.listeners.push(l);
    return () => { this.listeners = this.listeners.filter((x) => x !== l); };
  }
}

export const networkMonitor = new NetworkMonitor();
