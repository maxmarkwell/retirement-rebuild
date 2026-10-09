# Accelerated Growth Discovery v2 — Offline Shadow Protocol

## Scope

The `v2-offline-shadow-run.ts` entry point compares already-computed, caller-provided v1 screening snapshots and v2 research-gate outputs. It is a **pure offline function**, not a route, scheduled job, database reader, or trading workflow. No production integration is authorized by its presence.

## Input contract

- `runId`: unique caller-supplied label; the function does **not** enforce uniqueness across runs.
- `capturedAt`: UTC timestamp; caller must establish actual source capture time.
- `v1SnapshotId`, `v2SnapshotId`: distinct caller-supplied labels. Distinct labels do **not** prove independent snapshots or their authenticity.
- `v1Manifest` and `v2Manifest`: version-pinned (`ag-v1` and `ag-v2`), matching fiscal-period and universe metadata, UTC capture times within one hour, and matching research-as-of timestamps. The validator checks declared metadata, not original source documents.
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

## Mandatory source-evidence preflight

Every offline shadow request must now supply `evidence` batches covering each
compared ticker. The preflight checks the declared issuer, fiscal period,
document/extraction identity, source kind, publication and retrieval cutoff,
and duplicate metric/source pairs. Missing or inconsistent batches reject
the entire comparison. It remains a caller-supplied metadata and lineage
check: source authenticity, fiscal-calendar interpretation and independent
reconciliation of values require separate verification. No network or
production integration is enabled.

## Filing/vendor reconciliation

The offline request includes `reconciliationTolerances`, keyed by metric in
the metric's normalized unit. Whenever vendor observations are supplied,
the preflight requires corresponding filing observations and runs the existing
issuer/period/unit/value and independent-extraction reconciliation checks.
Missing, invalid or exceeded tolerances reject the run. Filing-only evidence
remains valid for paths that do not require vendor corroboration; this layer
does not yet enforce path-specific source requirements or authenticate the
documents. Tolerances are caller supplied and must be approved by the
research policy before relying on comparison outcomes.

### Tolerance guardrail

For offline filing/vendor comparisons, a configured absolute tolerance must
be finite, nonnegative, and no greater than 1% of the filing observation's
absolute value. A zero filing value therefore requires an exact match. This
is a conservative interim safety ceiling, not a validated metric-specific
materiality policy. The research team must establish metric-specific
thresholds before production consideration.

## Offline research prioritization (provisional)

`selectV2ResearchCandidates` is a deterministic, side-effect-free research shortlist utility, not connected to the production daily cycle. It evaluates all five opportunity paths without per-path quotas; ranks QUALIFIED ahead of WATCH, then evidence coverage, then NEW_DISCOVERY ahead of WATCH_REASSESSMENT only when evidence priority ties, then symbol for reproducibility. It deduplicates issuer symbols and fails closed on malformed inputs. This does not guarantee new-discovery slots and does not make investment or position-sizing decisions. A separate, version-bound integration and shadow evaluation are required before replacing the existing daily-cycle research selector.

The emerging-opportunity screen now keeps evidence-backed first commercialization from a zero revenue or customer baseline as WATCH rather than automatically declaring it insufficient; zero baseline does not imply an infinite growth rate or a QUALIFIED decision. Catalyst dates must be strict valid YYYY-MM-DD calendar dates and strictly future to the assessment date.

## Research-slot shadow comparison

`compareV2ResearchSlots` accepts an explicit `ag-opportunity-v2` version, a run ID, bounded research capacity, a v1 selected-symbol snapshot, and offline v2 candidates. It reports v1/v2 overlap, newly selected names, displaced v1 names, and WATCH/new-discovery counts. It rejects mismatched versions, duplicate or missing v1 candidate identities, and over-capacity snapshots. The input must be independently captured from a comparable historical cycle; synthetic examples demonstrate mechanics only. This utility is separate from `runV2OfflineShadow`, which compares research gates, and is **not wired into** the production daily-cycle route. The tie-break preference for new discoveries does not guarantee them capacity against higher-ranked WATCH candidates; this is deliberate to avoid arbitrary quotas.
