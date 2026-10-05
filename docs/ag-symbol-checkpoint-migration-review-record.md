# AG symbol checkpoint migration review record

Status: **review package only — not production authorization.**

## Reviewed artifact

Candidate: `supabase/migration-candidates/20261005_ag_symbol_checkpoints_review_candidate.sql`
Pinned Git content digest: `e39963134620ee88d91641255dd6cc007281914e`
Draft PR: #13
Production prerequisite: migrations through `20261005175157_ag_recovery_revoke_anon_rpc_execute`
Production state at review: symbol checkpoint table/RPCs absent; core recovery ledgers empty; AG OFF.

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

- [ ] Recompute and independently verify the candidate Git blob digest against `e39963134620ee88d91641255dd6cc007281914e`.
- [ ] Confirm PostgreSQL draft CI is green at the exact candidate head.
- [ ] Freshly confirm production still lacks the symbol table/RPCs and migration history has not advanced incompatibly.
- [ ] Freshly confirm core recovery ledgers contain no unexpected in-flight evidence.
- [ ] Review current Supabase security advisors and expected authenticated SECURITY DEFINER warnings.
- [ ] Obtain explicit production DDL authorization.
- [ ] Apply as a new version-controlled migration without changing AG enablement.
- [ ] Postflight table/RLS/grants/function ownership/search_path/PUBLIC/anon/authenticated/service_role privileges.
- [ ] Re-run security advisors.
- [ ] Keep AG OFF after schema success.

## Separation of authority

Schema success does not authorize route wiring, research, persistence execution, paper activation, or any real-money transaction. Those remain later gates.
