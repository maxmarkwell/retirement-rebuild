# Accelerated Growth recovery security and migration review

**Status: branch review only; no production migration or activation authorized.**

## Recovery privilege surface

The draft recovery tables `ag_cycle_stage_checkpoints`, `ag_cycle_decision_writes`, and `ag_cycle_watch_writes` enable RLS, revoke direct `anon` / `authenticated` table access, and grant table access to `service_role`. Application access is through owner-scoped RPCs rather than direct table reads.

All reviewed recovery SECURITY DEFINER functions use an empty `search_path`, schema-qualify recovery relations/functions, revoke default PUBLIC execution, and grant only the intended authenticated RPC surface. The reviewed set covers stage claim/completion, owner-scoped reads, atomic decision/watch persistence, watch postcondition verification, Committee/holding payload verification, and aggregate persistence completion.

The disposable restricted-role and cross-owner tests remain mandatory because SECURITY DEFINER correctness depends on explicit ownership predicates in each function.

## Migration order

The executable CI dependency order is: audited pre-provenance schema; add `investment_decisions.notes`; watchlist schema/compatibility; checkpoint table; stage RPCs; decision/watch ledgers; recovery reads; atomic watch RPC/verifiers; atomic decision RPC; Committee/holding verifiers; aggregate persistence completion; then audited-schema behavioral tests.

CI now executes behavior after the complete dependency chain. This caught and corrected a test-order mistake where behavior was invoked before payload verifiers existed.

## Locking and recovery

Persistence completion locks the persistence checkpoint and verifies decision and watch evidence before completion. Decision/watch writers require the same live persistence claim and reject expired or mismatched claims. Per-ticker advisory locks and newer-cycle fences protect against stale-cycle overwrite.

Ambiguous persistence responses are not automatically retried by application adapters. Exact committed evidence is reconciled through read/verifier RPCs. Stale stage leases are not automatically reclaimed and require manual review.

## Production blockers

This review does **not** authorize production DDL. Before production application: package the proposals into a reviewed migration preserving dependency order; verify function ownership and grants after migration; run Supabase security/database advisors in a controlled environment; confirm rollback/forward-fix procedure for partial migration failure; keep AG default-OFF and the legacy fail-closed guard throughout migration; and separately approve deployment and later paper-only activation.

Pre-existing live SECURITY DEFINER warnings outside this recovery package remain a separate audit item. They should not be blindly revoked because some may support intended signup/user workflows.

## Conclusion

The branch recovery privilege model and migration dependency order are internally consistent under disposable PostgreSQL and the audited production-shaped fixture. This supports preparing a migration package for independent review, but not applying it to production or wiring the active AG route.

## Packaged migration candidate evidence

A non-numbered review artifact now exists at `supabase/migration-candidates/20261005_ag_recovery_review_candidate.sql`. CI creates a fresh database from the audited pre-provenance fixture, loads the existing research-watchlist migration, applies this candidate as one transaction, asserts recovery-table RLS/direct-grant boundaries and SECURITY DEFINER search-path/PUBLIC-execute posture, then executes the audited decision/watch/persistence behavior suites.

The candidate passed PostgreSQL CI at `f9b6043`, along with the isolated recovery suites. Contract CI at the same head passed AG tests, Next type generation, and TypeScript compilation. This is review evidence only: the candidate is intentionally outside `supabase/migrations` and has not been applied to Supabase.

## Failure/rollback review

CI now deliberately creates a conflicting recovery-table object after loading the audited pre-provenance fixture, then attempts the packaged candidate. The candidate fails after its early provenance/watchlist DDL has begun; because the package is enclosed in one PostgreSQL transaction, the test verifies that the new `investment_decisions.notes` column, watchlist constraint mutation, and recovery functions are all rolled back while the preexisting conflict object remains unchanged. A clean database then applies the same candidate successfully and reruns behavior tests.

Current Supabase documentation continues to require a fixed `search_path` for SECURITY DEFINER functions and notes that functions are executable by PUBLIC by default unless revoked. The recovery RPCs intentionally remain authenticated SECURITY DEFINER endpoints because they provide narrowly owner-scoped access to otherwise private recovery tables; this means Supabase advisor warnings for authenticated SECURITY DEFINER execution should be expected and must be reviewed as intentional rather than blindly suppressed or revoked.

## Live read-only preflight

A read-only production catalog preflight on 2026-10-05 confirmed PostgreSQL 17.6, the expected `anon`, `authenticated`, and `service_role` roles, `pgcrypto` in the `extensions` schema, absence of `investment_decisions.notes`, and absence of the proposed recovery tables/functions. It also confirmed migration-history entries `20260922100000` and `20260924190000` and that the live watchlist resolution constraint already includes all three quantitative resolution values.

That last finding removed redundant watchlist constraint DDL from the packaged recovery candidate. Candidate CI now begins from the reconciled watchlist state by applying both historical watchlist migrations before the recovery candidate. At `f237325`, PostgreSQL CI passed audited-schema behavior, forced transactional rollback, clean candidate application, privilege assertions, and transactional smoke tests; contract CI passed AG tests, Next type generation, and TypeScript compilation.
