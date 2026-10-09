# AG live schema audit — 2026-10-05

Status: **production catalog audit completed. Migration-history reconciliation, BUY-authorization privilege hardening, the core AG recovery DDL, and the anon-RPC privilege follow-up were subsequently applied and verified. AG remains OFF. The review-only per-symbol checkpoint candidate remains unapplied.**

## Confirmed live compatibility facts

- PostgreSQL is 17.x in the connected Supabase project.
- `public.investment_decisions` exists with RLS enabled.
- The AG decision columns `ag_thesis_valid`, `ag_liquidity_eligible`,
  `ag_evidence_version`, and `ag_theme_key` exist and are nullable.
- `investment_decisions.notes` was **absent at the time of this initial audit**. It was subsequently added by production migration `20261005174550_ag_recovery_atomic_persistence` as part of the approved recovery package.
- `confidence_score` is numeric and its live constraint permits NULL or
  values from 0 through 100, matching the draft decision confidence scale.
- Live `decision_type` accepts buy, sell, hold, watch, rebalance, and avoid;
  the draft's narrower AG subsets are compatible.
- Live `source` accepts `ai_committee`.
- A unique partial index,
  `investment_decisions_one_active_ai_per_ticker`, permits only one active
  `ai_committee` row for a user/portfolio/ticker. It is not era-scoped.
  Draft persistence must explicitly fence any active row predating the
  current strategy era rather than discovering the conflict only at INSERT.
- Live `investment_decisions` also has a SECURITY DEFINER BEFORE INSERT trigger,
  `supersede_prior_active_ai_decisions_before_insert`, which supersedes every
  active `ai_committee` row for the same user/portfolio/ticker without an era
  predicate. The draft's pre-era fence must therefore execute before INSERT;
  the disposable fixture now mirrors this trigger so a regression would mutate
  historical state and fail CI.
- `public.ag_research_watchlist` exists with RLS enabled and the expected
  source-row/timestamp fields. Its live resolution constraint includes
  `QUANTITATIVE_REVIEW`, `QUANTITATIVE_REJECT`, and
  `QUANTITATIVE_INSUFFICIENT_DATA`. The earlier repository warning that
  production might reject those values is resolved by live evidence.
- The live watchlist has a unique partial index enforcing one unresolved row
  per user/portfolio/strategy-era/ticker.
- `pgcrypto` 1.3 is installed in schema `extensions`. Draft recovery SQL
  must call `extensions.digest`, not `public.digest`.
- At the time of this initial audit, proposed recovery objects `ag_cycle_stage_checkpoints`, `ag_cycle_decision_writes`, and `ag_cycle_watch_writes` and their recovery RPCs were absent. They were subsequently installed by `20261005174550_ag_recovery_atomic_persistence`. Production migration `20261005175157_ag_recovery_revoke_anon_rpc_execute` then removed anonymous execution from the reviewed recovery RPC set. Current postflight verifies PUBLIC=false and anon=false for those recovery RPCs while authenticated/service-role access remains intentional and owner-scoped.
- `ag_cycle_symbol_checkpoints` and its symbol claim/completion/read RPCs remain **unapplied**. They are still a review-only candidate.

## Migration-history reconciliation

The Sep. 21–24 repository migrations were reconciled against the live catalog and recorded as applied without replaying their SQL bodies. Remote migration history now includes the complete audited chain through `20260924190000_ag_quantitative_watch_resolutions`. A subsequent least-privilege migration, `20261005151442_harden_ag_buy_authorization_table_privileges`, was applied and its repository timestamp aligned with production. The BUY authorization table now revokes direct `anon`/`authenticated` privileges while retaining RLS and service-role access.

## Current follow-up before any activation

1. Keep AG default-OFF and the legacy persistence hard block.
2. Preserve the now-deployed `investment_decisions.notes` provenance contract and verify it in all recovery/runner acceptance tests.
3. Use `extensions.digest` in every recovery function and mirror that schema
   in disposable PostgreSQL tests.
4. Fence pre-era active AI decisions explicitly before atomic insertion.
5. Preserve the now-reconciled migration history; do not replay the Sep. 21–24 migration bodies. Keep future repository migration timestamps aligned with production history.
6. The disposable fixture mirrors the live cross-era uniqueness index, pgcrypto schema and decision supersession trigger. The core recovery package and anon privilege hotfix are now production facts; keep candidate/fixture tests aligned with that post-migration baseline. Validate the separate symbol-checkpoint candidate before any further DDL.
7. Security-review all SECURITY DEFINER functions and grants independently
   before deployment.

This audit authorizes no migration, merge, deployment, AG run, or trade.

## Post-audit production reconciliation — 2026-10-05

Production migration history now extends through `20261005175157_ag_recovery_revoke_anon_rpc_execute`. The core recovery tables/RPCs and decision `notes` provenance column are live; recovery ledgers were empty at postflight and AG remained OFF. Current security review confirms the 13 recovery SECURITY DEFINER RPCs deny PUBLIC/anon execution and retain authenticated/service-role execution by design. Supabase may still warn on authenticated SECURITY DEFINER execution; those warnings are expected for this owner-scoped recovery API and remain subject to review rather than automatic revocation.

The next schema boundary is the separate `20261005_ag_symbol_checkpoints_review_candidate.sql`. It is not present in production and requires its own review/authorization. This document does not authorize that migration, runner wiring, AG activation, research, or trades.
