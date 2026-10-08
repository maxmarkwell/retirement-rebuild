# Accelerated Growth autonomous daily cycle — production validation gate

## Verified recovery baseline (2026-10-08)

- Attempt 5: `66536f35-5572-43fc-aba3-6edd8291bd30`, cycle date 2026-10-07, marked `failed` at 2026-10-08 16:22:45 UTC.
- Four research checkpoints remain `completed`; no persistence/finalized checkpoint and no cycle-linked decision or WATCH write ledger rows.
- Frozen intents: four reassessments of pre-existing research WATCH identities and one new WATCH intent. These were **not** committed for Attempt 5.
- Supabase migration `ag_guard_manual_cycle_recovery_durability_evidence` installed; live function guards owner, active worker, durability checkpoint and write ledger.
- Feature branch `feat/ag-autonomous-daily-cycle` has preview deployment; production application still requires separate promotion.
- No trading, portfolio execution, or real-money operations authorized.

## Release prerequisites — do not skip

1. Review PR #14 against production, including all queue callbacks, worker authorization, persistence and finalization RPCs, and migrations.
2. Confirm build and contract tests pass for **the exact release SHA**. Vercel READY is a build signal, not an end-to-end cycle proof.
3. Confirm live database migration state and required RPC definitions. Do not reapply the already-installed recovery migration.
4. Confirm production environment flags and scopes without exposing secrets. In particular, verify queue, worker, autonomous cycle, autonomous durability, resumable research and resumable durability settings together.
5. Keep all paper transaction execution flags OFF. Do not run the real portfolio or any trade endpoint.
6. Record baseline cycle count, paper holdings, research WATCH rows, decision rows, write ledgers, checkpoints, and worker authorizations before starting a new attempt.
7. Obtain separate approval for production application promotion, changing research/durability flags, and starting a new cycle. Recovery-only approval does not cover those actions.

## Paper-only six-stage acceptance test

1. Deploy reviewed SHA to the intended production target; confirm exact SHA, target and healthy routes.
2. Enable a **single** viable durability path. For autonomous queue execution, all autonomous cycle, queue, worker, and durability flags must be enabled; avoid mixed partial configurations.
3. Initiate only one controlled paper AG cycle. Capture cycle ID, date, attempt number and worker authorization expiry; do not start a duplicate.
4. Verify stages complete in order: `holding_review`, `discovery`, `catalyst_deep_research`, `committee`, `persistence`, `finalized`.
5. Verify frozen persistence intents against cycle-linked write ledgers and authoritative postconditions. Existing WATCH records must be distinguished by source identity; zero investment decisions can be valid.
6. Verify final cycle status `completed`, expected counters, no stale worker authorization, no ambiguous/pending ledger entries, and no transaction/holding changes.
7. On any failure or ambiguity, stop; do not replay persistence or manually mark a partially durable cycle failed. Reconcile first.

## Rollback and failure policy

- Turning off flags while queue messages are in flight causes bounded retries and eventual worker revocation, not a successful completion. It does **not** finish or repair the cycle.
- Do not automatically retry a cycle with `persistence`/`finalized` checkpoint or any cycle-linked write ledger evidence.
- Reconcile queue delivery and DB state before deciding whether to recover or resume.
- Preserve research checkpoints and audit evidence. No automatic trades under any outcome.
