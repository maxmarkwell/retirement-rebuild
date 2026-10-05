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
