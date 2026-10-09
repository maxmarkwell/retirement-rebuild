# AG recovery production migration runbook

**Status: DRY-RUN / REVIEW ONLY. This document does not authorize production DDL, deployment, AG activation, research execution, or transactions.**

## Reviewed artifact identity

Candidate: `supabase/migration-candidates/20261005_ag_recovery_review_candidate.sql`

Pinned Git content digest: `105d32e85078df1e5eb9b953c983ca6732e679d4`

Before any approved execution, `git hash-object` for the candidate must equal the pinned digest. Any content change invalidates the approval and requires the complete migration-candidate CI/review cycle again.

## Preconditions — all must pass

1. AG remains disabled at the application feature gate and the active runner still contains the fail-closed legacy-persistence guard.
2. No deployment, research run, paper transaction, or real-money transaction is in progress.
3. Production migration history contains `20260922100000` and `20260924190000`.
4. `public.investment_decisions.notes` is absent.
5. `public.ag_cycle_stage_checkpoints`, `public.ag_cycle_decision_writes`, and `public.ag_cycle_watch_writes` are absent.
6. Recovery RPCs from this package are absent.
7. `pgcrypto` is installed in schema `extensions`.
8. Roles `anon`, `authenticated`, and `service_role` exist.
9. The live watchlist resolution constraint already contains the three `QUANTITATIVE_*` values.
10. A current backup/recovery posture and an operator able to stop on the first unexpected result are confirmed.
11. The exact candidate digest above has independent approval.

If any precondition differs, STOP. Do not edit the migration ad hoc in production.

## Approved-execution procedure — not authorized by this document

When separately authorized, apply the exact candidate as one migration transaction using the supported Supabase migration path. Do not copy/paste individual sections and do not retry a failed partial-looking response until catalog state and migration history are reconciled.

The candidate itself contains `BEGIN` / `COMMIT`. CI proves a deliberate mid-migration object conflict rolls back the early provenance DDL and recovery objects atomically.

## Immediate postflight — before any deployment or AG enablement

Verify all of the following while AG remains OFF:

- `investment_decisions.notes` exists and is nullable.
- all three recovery tables exist with RLS enabled;
- `anon` and `authenticated` have no direct recovery-table privileges;
- `service_role` retains required recovery-table access;
- the exact authenticated SECURITY DEFINER recovery RPC set matches CI;
- every reviewed SECURITY DEFINER recovery RPC has a fixed empty `search_path`;
- PUBLIC cannot execute recovery RPCs;
- trigger-only `ag_protect_completed_checkpoint()` is not executable by PUBLIC/anon/authenticated;
- function owners are the expected migration owner and have not drifted to an API role;
- no recovery checkpoint, decision-ledger, or watch-ledger rows were created merely by migration;
- existing portfolio, decision, watchlist, and transaction row counts/content are unchanged except for the additive nullable `notes` column;
- Supabase security/database advisors are reviewed. Authenticated SECURITY DEFINER warnings for the deliberately owner-scoped recovery RPCs require explicit review; do not automatically suppress them and do not blindly revoke intended RPC access.

## Failure decisions

**Migration reports failure and catalog shows no candidate objects:** record the error, confirm transaction rollback, leave AG OFF, fix only on a new reviewed candidate.

**Client/network reports ambiguity:** do not retry. Read migration history and catalog first. Determine whether COMMIT occurred. If committed, run full postflight. If not committed, verify rollback before considering a newly authorized retry.

**Migration commits but a postflight assertion fails:** leave AG OFF. Do not deploy runner wiring. Prefer a reviewed forward-fix when destructive rollback could affect newly created evidence. Because no application path should use these objects yet, unexpected recovery rows are themselves a STOP condition.

**Advisor shows a new unexpected ERROR/WARN:** leave AG OFF and investigate before deployment.

## Separate activation gates

Successful DDL is not AG reactivation. After migration postflight passes, runner wiring/deployment remains a separate reviewed change. Paper-only AG enablement is another separate authorization after runner acceptance. Transaction execution remains disabled until independently authorized.

## Evidence to capture

Record candidate digest, migration version assigned by Supabase, start/end timestamps, migration result, preflight/postflight query output, function owners/grants, advisor output, CI head, and operator/reviewer approval. Link those artifacts back to draft PR #13 before changing its deployability status.
