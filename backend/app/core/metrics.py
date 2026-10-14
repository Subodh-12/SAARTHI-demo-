"""In-process metrics registry (counters + histograms) for SAARTHI.

Metrics are exposed via `/api/v1/metrics` as Prometheus text format. Real
Prometheus exporter can be plugged in by replacing `MetricRegistry.export()`.
For MVP, this gives us the measurable counters the design doc requires
(sync lag/outbox depth, fallback rates, decision latency, validation
rejection, provider availability) without an external dependency.
"""
from __future__ import annotations

import threading
import time
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Dict


@dataclass
class Counter:
    name: str
    help: str
    value: float = 0.0
    labels: Dict[str, float] = field(default_factory=lambda: defaultdict(float))
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def inc(self, amount: float = 1.0, **labels) -> None:
        with self._lock:
            self.value += amount
            key = "|".join(f"{k}={v}" for k, v in sorted(labels.items()))
            self.labels[key] += amount

    def samples(self) -> list[tuple[str, float]]:
        with self._lock:
            return [(k or "_", v) for k, v in self.labels.items()]


@dataclass
class Histogram:
    name: str
    help: str
    buckets_ms: tuple = (10, 25, 50, 100, 150, 250, 500, 1000, 2500, 5000, 10000, 30000)
    _counts: list[int] = field(init=False)
    _sum: float = 0.0
    _count: int = 0
    _lock: threading.Lock = field(default_factory=threading.Lock)

    def __post_init__(self) -> None:
        self._counts = [0] * len(self.buckets_ms)

    def observe(self, value_ms: float) -> None:
        with self._lock:
            self._sum += value_ms
            self._count += 1
            for i, b in enumerate(self.buckets_ms):
                if value_ms <= b:
                    self._counts[i] += 1
                    break
            else:
                # over the last bucket — count toward last bucket too
                self._counts[-1] += 1

    def export(self) -> str:
        with self._lock:
            lines = [f"# HELP {self.name} {self.help}",
                     f"# TYPE {self.name} histogram"]
            cumulative = 0
            for i, b in enumerate(self.buckets_ms):
                cumulative = self._counts[i]
                lines.append(f'{self.name}_bucket{{le="{b}"}} {cumulative}')
            lines.append(f'{self.name}_bucket{{le="+Inf"}} {self._count}')
            lines.append(f"{self.name}_sum {self._sum:.3f}")
            lines.append(f"{self.name}_count {self._count}")
            return "\n".join(lines)


class MetricRegistry:
    def __init__(self) -> None:
        self.api_errors = Counter("saarthi_api_errors_total", "API errors by error_code")
        self.api_latency = Histogram("saarthi_api_latency_ms", "API request latency")
        self.llm_latency = Histogram("saarthi_llm_latency_ms", "LLM call latency")
        self.translation_latency = Histogram("saarthi_translation_latency_ms", "Translation tool latency")
        self.translation_available = Counter(
            "saarthi_translation_provider_available_total",
            "Translation provider availability checks (1=ok,0=unavailable)",
        )
        self.fallbacks = Counter("saarthi_fallbacks_total", "Fallback usage by reason")
        self.sync_lag = Counter("saarthi_sync_outbox_depth", "Sync outbox depth snapshot")
        self.pack_download_fail = Counter("saarthi_pack_download_failures_total",
                                          "Pack download failures by reason")
        self.decision_latency = Histogram("saarthi_decision_latency_ms",
                                          "Local/server decision latency")
        self.validation_rejection = Counter(
            "saarthi_validation_rejections_total",
            "Rejections by gate",
        )

    def export(self) -> str:
        out = []
        for c in [self.api_errors, self.fallbacks, self.pack_download_fail,
                  self.validation_rejection, self.sync_lag]:
            out.append(f"# HELP {c.name} {c.help}")
            out.append(f"# TYPE {c.name} counter")
            samples = c.samples()
            if not samples:
                out.append(f"{c.name} 0")
            for k, v in samples:
                if k == "_":
                    out.append(f"{c.name} {v}")
                else:
                    out.append(f'{c.name}{{{k}}} {v}')
        for h in [self.api_latency, self.llm_latency, self.translation_latency,
                  self.decision_latency]:
            out.append(h.export())
        return "\n".join(out) + "\n"


_REGISTRY = MetricRegistry()


def get_registry() -> MetricRegistry:
    return _REGISTRY


__all__ = ["MetricRegistry", "get_registry", "Counter", "Histogram"]
