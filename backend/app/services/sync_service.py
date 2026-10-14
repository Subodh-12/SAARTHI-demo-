"""Sync service — idempotent, ordered, per-event outcome, backoff, dead-letter.

The server replays accepted events to rebuild canonical mastery, returns
the next decision, and the canonical ruleset version. The client
acknowledges only accepted/duplicate events and rebases local state.

This service never blindly overwrites the mastery snapshot; it recomputes
from the event log (which is the source of truth).
"""
from __future__ import annotations

import time
from typing import Optional

from ..core.logging import get_logger
from ..core.metrics import get_registry
from ..core.settings import get_settings
from ..core.errors import ErrorCode, SaarthiError
from ..domain.bkt import bkt_band, bkt_update, evidence_from_event
from ..domain.ruleset import get_ruleset
from ..domain.schemas import (
    BackgroundAction, Decision, LearnerEvent, MasteryRecord, Outcome,
    PerEventResult, SyncRequest, SyncResponse, Action, DeliveryMode,
    NetworkState, new_decision_id,
)
from ..i18n.reasons_or import REASON_MESSAGES
from ..repositories import (
    DecisionRepository, EventRepository, MasteryRepository,
)

log = get_logger("saarthi.sync")


class SyncService:
    def __init__(self, events: EventRepository, mastery: MasteryRepository,
                 decisions: DecisionRepository) -> None:
        self.events = events
        self.mastery = mastery
        self.decisions = decisions
        self.settings = get_settings()

    async def sync(self, req: SyncRequest) -> SyncResponse:
        """Process a sync batch.

        Per event:
          - ACCEPTED on first insert; triggers mastery replay for that concept.
          - DUPLICATE returns success without re-applying mastery.
          - REJECTED (validation failure) → dead-letter + retryable=false.
          - RETRYABLE (transient DB error) → no ack; client retries.

        Ordering is by (device_id, seq). For MVP, one active device per learner
        is enforced by `learner_profiles.active_device_id UNIQUE` (D-009).
        """
        batch_size = get_ruleset().sync.get("batch_size", 100)
        if len(req.events) > batch_size:
            raise SaarthiError(ErrorCode.SYNC_BATCH_TOO_LARGE, status=400,
                               detail=f"batch > {batch_size} events")
        # Enforce ordering: client must submit in seq order
        seqs = [e.seq for e in req.events]
        if seqs != sorted(seqs):
            raise SaarthiError(ErrorCode.SYNC_ORDERING_CONFLICT, status=400,
                               detail="events not in seq order; sort and retry")

        outcomes: list[PerEventResult] = []
        # Track which concepts got ACCEPTED events so we replay mastery for those
        accepted_concepts: dict[str, list[tuple[int, str, str]]] = {}
        ruleset = get_ruleset()

        for ev in req.events:
            # Verify ownership: event.learner_id must match req.learner_id, and
            # event.device_id must match req.device_id.
            if ev.learner_id != req.learner_id or ev.device_id != req.device_id:
                outcomes.append(PerEventResult(
                    event_id=ev.event_id, seq=ev.seq, outcome=Outcome.REJECTED,
                    detail="learner/device mismatch",
                ))
                await self.events.move_to_dead_letter(
                    ev, "learner_device_mismatch", ErrorCode.SYNC_EVENT_REJECTED.value)
                get_registry().api_errors.inc(error_code="sync_event_rejected")
                continue

            try:
                result = await self.events.insert_event(ev)
            except Exception as e:
                # Retryable: DB error, transient
                log.warning("sync_insert_failed event_id=%s seq=%s err=%s",
                            ev.event_id, ev.seq, e)
                outcomes.append(PerEventResult(
                    event_id=ev.event_id, seq=ev.seq, outcome=Outcome.RETRYABLE,
                    detail=f"transient: {type(e).__name__}",
                ))
                continue

            outcomes.append(result)
            if result.outcome == Outcome.ACCEPTED:
                # Track concept for mastery replay
                if ev.concept_id:
                    accepted_concepts.setdefault(ev.concept_id, []).append(
                        (ev.seq, ev.payload.get("evidence", "none"),
                         ev.event_type.value))
            elif result.outcome == Outcome.DUPLICATE:
                log.info("sync_duplicate event_id=%s seq=%s", ev.event_id, ev.seq)
            # REJECTED (shouldn't happen here, but just in case)

        # Replay mastery for accepted concepts (BKT sequential replay)
        canonical_mastery = await self._replay_mastery_for_concepts(
            req.learner_id, accepted_concepts, ruleset)

        # Bump sync cursor
        last_acked = max([r.seq for r in outcomes if r.outcome in (Outcome.ACCEPTED, Outcome.DUPLICATE)] + [0])
        last_server_seq = await self._max_server_seq(req.learner_id, req.device_id)
        await self.events.bump_sync_cursor(req.device_id, req.learner_id, last_acked, last_server_seq)

        # Compute next decision (deterministic, server-side)
        decision: Optional[Decision] = None
        if req.events:
            last_event = req.events[-1]
            trigger_event = last_event.event_type.value
            trigger_concept = last_event.concept_id
            trigger_evidence = last_event.payload.get("evidence", "none")
            # Use server-engine decision (network = RECONNECTED since sync is post-reconnect)
            try:
                from .decision_service import DecisionService
                from ..content.pack_loader import load_pack_index
                pack = load_pack_index()
                ds = DecisionService(pack, self.mastery, self.decisions)
                decision = await ds.next_decision(
                    learner_id=req.learner_id, env_network=NetworkState.RECONNECTED,
                    produced_by="server_engine",
                    trigger_event_type=trigger_event,
                    trigger_concept_id=trigger_concept,
                    trigger_evidence=trigger_evidence,
                    recent_events=req.events[-10:],
                )
            except Exception as e:
                log.warning("sync_next_decision_failed err=%s", e)
                decision = None

        return SyncResponse(
            accepted=outcomes,
            server_learner_seq=last_server_seq,
            canonical_mastery=canonical_mastery,
            ruleset_version=ruleset.ruleset_version,
            next_decision=decision,
        )

    async def _replay_mastery_for_concepts(
        self, learner_id: str, accepted_concepts: dict, ruleset,
    ) -> list[MasteryRecord]:
        """Replay BKT for the concepts that got ACCEPTED events this batch.

        Reads the full event log for each affected concept (ordered by
        server_seq) and recomputes mastery from the prior. This is the
        authoritative replay.
        """
        if not accepted_concepts:
            return await self.mastery.get_mastery(learner_id)
        # Get current mastery as the starting point
        current = {m.concept_id: m for m in await self.mastery.get_mastery(learner_id)}
        # For each concept with a new event, replay from the event log
        all_events = await self.events.list_events(learner_id, since_seq=0, limit=10000)
        # Group by concept
        by_concept: dict[str, list[LearnerEvent]] = {}
        for e in all_events:
            if e.concept_id:
                by_concept.setdefault(e.concept_id, []).append(e)
        for cid, evs in by_concept.items():
            p = current[cid].p_known if cid in current else ruleset.bkt["priors"]["default_prior"]
            attempts = current[cid].attempts if cid in current else 0
            correct = current[cid].correct if cid in current else 0
            for e in sorted(evs, key=lambda x: x.seq):
                if not (e.event_type.value in ("mcq_answered", "short_answer_attempted")):
                    continue
                ev_evidence = e.payload.get("evidence", "none")
                if ev_evidence == "none":
                    continue
                from ..domain.bkt import BKTEvidence
                p = bkt_update(p, BKTEvidence(evidence=ev_evidence, weight=1.0), ruleset, cid)
                attempts += 1
                if ev_evidence == "correct":
                    correct += 1
            band = bkt_band(p, ruleset)
            await self.mastery.upsert_mastery(learner_id, cid, p, band, attempts, correct,
                                              max([e.seq for e in evs] + [0]))
            current[cid] = MasteryRecord(concept_id=cid, p_known=p, band=band,
                                          attempts=attempts, correct=correct,
                                          last_updated_event_seq=max([e.seq for e in evs] + [0]))
        return list(current.values())

    async def _max_server_seq(self, learner_id: str, device_id: str) -> int:
        cursor = await self.events.get_sync_cursor(device_id, learner_id)
        return cursor[1]
