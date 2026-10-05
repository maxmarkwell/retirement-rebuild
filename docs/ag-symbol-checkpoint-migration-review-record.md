# AG symbol checkpoint migration review record

Status: **production migration applied and postflight verified; AG remains OFF.**

## Reviewed artifact

Candidate: `supabase/migration-candidates/20261005_ag_symbol_checkpoints_review_candidate.sql`
Pinned Git content digest: `e39963134620ee88d91641255dd6cc007281914e`
Draft PR: #13
Production prerequisite: migrations through `20261005175157_ag_recovery_revoke_anon_rpc_execute`
Production state at review: symbol checkpoint table/RPCs absent; core recovery ledgers empty; AG OFF.
Applied production migration: `20261005190736_ag_symbol_checkpoints`.

## Verified branch evidence

- [x] Candidate is wrapped in one PostgreSQL transaction.
- [x] Forced-conflict CI verifies candidate rollback is atomic.
- [x] Candidate applies after the packaged core recovery migration in the audited production-shaped fixture.
- [x] Symbol table has RLS enabled and no direct anon/authenticated table grants.
- [x] Trigger-only immutability helper is unavailable to PUBLIC/anon/authenticated.
- [x] Callable symbol RPCs use SECURITY DEFINER with fixed empty search paths.
- [x] Callable symbol RPCs deny PUBLIC/anon and intentionally allow authenticated/service_role.
- [x] Symbol claims require an authenticated owner, running cycle, live running parent-stage claim, valid symbol identity, and renew only a still-valid parent lease.
- [x] Child completion requires the original child token, live child lease, live parent stage, owning user, running cycle, non-null output, and matching output symbol.
- [x] Completed symbol checkpoints are immutable.
- [x] Application fan-out is bounded to one expensive symbol work unit at a time.

## Required before production application

- [x] Recomputed and verified candidate Git blob digest `e39963134620ee88d91641255dd6cc007281914e` immediately before application.
- [x] PostgreSQL draft CI and AG contract CI green at exact pre-application head `fcd4f06a`.
- [x] Fresh preflight confirmed symbol table/RPCs absent and migration history reconciled through `20261005175157`.
- [x] Fresh preflight confirmed stage/decision/watch ledgers empty and zero running AG cycles.
- [x] Reviewed current security advisors before and after application.
- [x] Explicit production DDL authorization received in chat.
- [x] Applied as production migration `20261005190736_ag_symbol_checkpoints`; AG enablement unchanged.
- [x] Postflight verified table/RPC existence, RLS, direct table grants, and RPC PUBLIC/anon/authenticated/service-role execution posture. CI already verifies function search paths/ownership assumptions.
- [x] Security advisors rerun. New expected findings are RLS-without-policy for the service-only symbol table and authenticated SECURITY DEFINER warnings for the three owner-fenced symbol RPCs; no new anonymous symbol-RPC exposure.
- [x] AG remains OFF; zero running AG cycles and zero recovery/symbol rows after migration.

## Separation of authority

Schema success does not authorize route wiring, research, persistence execution, paper activation, or any real-money transaction. Those remain later gates.

## Production postflight

Migration `20261005190736_ag_symbol_checkpoints` succeeded. The symbol table and all three RPCs exist. RLS is enabled. `anon` and `authenticated` have no direct SELECT privilege on the table; `service_role` does. `PUBLIC` and `anon` cannot execute the claim RPC, while `authenticated` and `service_role` can as designed. Symbol, stage, decision, and watch recovery ledgers all contained zero rows after application, and there were zero running AG cycles. No research, runner activation, persistence replay, or transaction execution was authorized or performed.
