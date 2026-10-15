# AG worker persistence fencing audit (2026-10-15)

## Result: NOT READY TO ACTIVATE

The worker claim, renewal and completion RPCs fence their own checkpoint updates.
They **do not** fence independent research writes made by the legacy pipeline.

## Existing write path

`runAgResearchDailyCycle` in `daily-cycle-work.ts` invokes:
- `persistAgResearchWatchlist` (research watchlist mutations)
- `supersedeAgCommitteeWatches` (existing watch resolution changes)
- `persistAgHoldingReviewDecisions` (holding decision persistence)
- `persistAgCommitteeDecisions` (committee decision persistence)
- `executeAgDailyCycleTransactions` with `enabled: false` (transaction execution disabled)

Its `checkpoint` and `markStage` functions update `ag_daily_cycles` using a
running-cycle predicate. Neither takes a worker stage claim token. These writes
are **not safe** to reuse in a leased worker simply by checking a token in
TypeScript or by completing the checkpoint afterward. An expired worker can
race between a token check and a write.

## Activation prerequisites

1. Define the durable, idempotent payload and side-effect contract for each stage.
2. Move each persistent stage's writes behind database-atomic operations that
   validate the stage token, unexpired lease, running cycle, paper-only scope
   and protected-cycle exclusion **in the same transaction as the writes**.
3. Ensure supersession and decision persistence are replay-safe; a failed or
   expired stage must never be automatically reclaimed without audited recovery.
4. Add PostgreSQL integration tests where a token expires before persistence,
   and where cycle status changes before persistence. Verify **zero mutations**.
5. Add cross-session tests for renewal/completion versus cycle finalization.
6. Only after those gates pass, consider separate explicit activation of a
   research worker. BUY remains disabled until separately authorized; SELL
   remains disabled. Do not wire the worker to a route or scheduler here.

## Protected cycle

Cycle `583809c1-7157-4ad4-b343-56acc332a145` is excluded from new worker
entrypoints and SQL RPCs in the development branch. Do not reconcile, retry,
claim, complete or modify this cycle.

## Deployment

The SQL migrations and this audit are development-only. No migration or
activation is authorized against production by this document.
