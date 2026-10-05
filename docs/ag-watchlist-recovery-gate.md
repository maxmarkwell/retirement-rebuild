# AG watchlist recovery: schema and transaction gate

**Draft only. No live migration or active-runner integration.** The pure
`watchlist-intent-capture.ts` captures all three legacy mutation streams
from a clean, complete upstream research result. It is not proof that any
watchlist mutation was applied.

## Confirmed checked-in schema incompatibility

`supabase/migrations/20260922100000_ag_research_watchlist.sql` defines
`resolution` with only `PROCEED`, `STOP`, and `STALE`. The existing
`persistAgResearchWatchlist` writes `QUANTITATIVE_REVIEW`,
`QUANTITATIVE_REJECT` and `QUANTITATIVE_INSUFFICIENT_DATA` for quantitative
reassessments. Those values violate the **checked-in migration's** CHECK
constraint. Verify the live constraint definition read-only; do not assume
it was updated by an undocumented change. This may explain failures in
that path, but no live failure has been attributed to it.

The same migration constrains `confidence numeric(5,4)` to 0–1.
The existing `deep-research.ts` applies `normalizeAgConfidence`, which
normalizes source 0–100 model scores to the persisted 0–1 scale. The pure
watchlist intent planner now rejects values outside 0–1; do not bypass
that upstream normalization when freezing or replaying watch operations.

## Frozen intent and replay boundaries

- A successful upstream research stage must freeze its full original
  outcomes, quantitative resolutions, Committee watch resolutions, source
  identities, failure count and discovery completeness alongside the pure
  watchlist intent. No downstream re-fetch may alter frozen decisions.
- The two watch tables are **different mutation streams**: a research
  watchlist row and an active Committee WATCH decision may share a ticker.
  The planner permits this, but rejects conflicting research outcome and
  quantitative resolution for the same research-watch ticker.
- `upsert_watch` updates an existing unresolved research row or inserts a
  new one; `resolve_research` and `resolve_quantitative` only mutate an
  existing unresolved research row. `supersede_committee` targets only
  active era-scoped Committee WATCH decisions, never unrelated decisions.
- The research pipeline now freezes the exact prior `ag_research_watchlist.id`
  or active Committee `investment_decisions.id` observed during reassessment;
  row IDs are not sent to the research model prompt. A retry after a response
  timeout must compare the **frozen operation identity, typed payload, affected
  row identity and postcondition** with
  a durable write ledger before taking any action. A missing open watch
  after resolution is not sufficient proof: it might have been changed by
  another cycle or an operator. Freeze the original row identity when
  applying a resolution and fence newer-cycle updates.
- Avoid using the current wall clock as an idempotency payload field.
  Freeze a cycle timestamp or have the database set timestamps once on
  the initial atomic commit. The partial unique index permits one open
  watch per ticker, but does not prevent stale-cycle overwrites.
- The legacy `supersedeAgCommitteeWatches` writes directly to
  `investment_decisions`, outside the per-ticker decision RPC. Its
  effect must be incorporated into a reviewed, era-fenced atomic
  protocol, with a distinct operation ledger. Do not treat a zero-row
  retry as proof of prior success.

## Isolated read-only reconciliation

`watchlist-reconciliation.ts` now compares frozen typed operations with
scoped durable ledger rows, including stream, ticker, action, canonical
payload, committed status and affected row identity. It detects missing,
extra, pending, altered, duplicate and cross-cycle rows; every uncertain
case requires manual reconciliation. Even an exact ledger match is labeled
`VERIFIED_RECORDED_REQUIRES_DB_POSTCONDITIONS`: the actual affected watch
or Committee decision must still be verified read-only, and no automatic
retry is authorized. The proposed canonical serializer is an application
comparison contract; the eventual database RPC must derive and test its
own identical canonical encoding, never trust a supplied hash.

## Acceptance sequence

1. Read-only live catalog audit of `ag_research_watchlist` columns,
   `resolution` constraint, partial unique index, RLS and actual
   `investment_decisions` schema. Resolve any checked-in/live mismatch.
2. Freeze source-derived watchlist intent at a versioned stage boundary
   and validate the source confidence scale.
3. The isolated draft now has a source-row-fenced operation ledger and atomic
   RPC covering research upsert/resolution/no-op and Committee WATCH
   supersession. Disposable PostgreSQL tests at `c41c1096` cover initial apply,
   identical retry, conflicting retry, frozen-manifest membership, detailed
   quantitative resolution provenance and exact Committee source identity.
   Cross-owner denial, forced rollback after target mutation, and newer-cycle
   fencing also pass in disposable PostgreSQL at `fab4e511`. **Still add**
   timeout-after-commit reconciliation against actual row postconditions and
   run the suite against an audited actual-schema fixture before satisfying
   this gate.
4. Test against a disposable fixture reconstructed from the audited
   actual schema; require exact watch-operation coverage before marking
   the full cycle finalized.
5. Obtain separate migration/deployment/enablement authorization. Keep
   AG disabled and the legacy persistence fail-closed throughout.
