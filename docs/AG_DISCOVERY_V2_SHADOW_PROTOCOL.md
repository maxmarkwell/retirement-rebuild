# Accelerated Growth Discovery v2 — Offline Shadow Protocol

## Scope

The `v2-offline-shadow-run.ts` entry point compares already-computed, caller-provided v1 screening snapshots and v2 research-gate outputs. It is a **pure offline function**, not a route, scheduled job, database reader, or trading workflow. No production integration is authorized by its presence.

## Input contract

- `runId`: unique caller-supplied label; the function does **not** enforce uniqueness across runs.
- `capturedAt`: UTC timestamp; caller must establish actual source capture time.
- `v1SnapshotId`, `v2SnapshotId`: distinct caller-supplied labels. Distinct labels do **not** prove independent snapshots or their authenticity.
- `rows`: 1–500 company entries; one row per symbol; v1 status, v2 path and optional already-evaluated v2 research gate.
- A missing v2 gate is classified `INSUFFICIENT_DATA`; never silently counted as a qualifying investment.

## Interpretation

The two versions represent different screening stages and status taxonomies. Exact status agreement is **not** equivalent to investment agreement. Semantic outcome buckets only compare unambiguous cases: v1 ADVANCE/REJECT against v2 ELIGIBLE/NOT_QUALIFIED. REVIEW, WATCH and RISK_REVIEW remain UNMAPPED. Evidence gaps are reported separately, not treated as thesis rejections.

## Safe operating procedure

1. Export or otherwise obtain read-only, point-in-time research results through an independently reviewed procedure. This module does not do that.
2. Verify snapshot identity, source freshness, candidate-universe coverage, issuer/symbol mappings and time alignment externally. Labels alone do not verify any of these.
3. Compute v2 gates with strict lineage and verified source evidence. A v2 gate object is not cryptographically authenticated by the shadow interface.
4. Invoke the offline function and inspect `accepted` and `issues`. Reject invalid batches; do not use partial outcome counts.
5. Review individual disagreements, gaps, and unmapped outcomes before considering integration.

## Explicitly deferred

- Production scheduler, daily-cycle route, Supabase queries or writes.
- Any migration, WATCH supersession, committee decision, order placement or allocation change.
- Treating shadow results as proof of better investment performance.
- Enabling live SEC ingestion by default.

## Graduation criteria

A future shadow pilot should require reproducible inputs, verified fiscal-quarter alignment, reconciled independent evidence, version-pinned research snapshots, audit-ready logs, no trading side effects and explicit authorization before any production change.
