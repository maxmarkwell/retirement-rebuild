# AG live schema audit — 2026-10-05

Status: **production catalog audit completed; migration-history reconciliation and BUY-authorization privilege hardening were subsequently completed and verified. Recovery DDL remains unapplied.**

## Confirmed live compatibility facts

- PostgreSQL is 17.x in the connected Supabase project.
- `public.investment_decisions` exists with RLS enabled.
- The AG decision columns `ag_thesis_valid`, `ag_liquidity_eligible`,
  `ag_evidence_version`, and `ag_theme_key` exist and are nullable.
- `investment_decisions.notes` **does not exist**. The draft atomic decision
  RPC and both decision payload verifiers currently depend on this field.
  Activation therefore remains blocked until a separately reviewed,
  version-controlled provenance migration is approved and applied, or the
  persistence contract is redesigned without losing provenance.
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
- Proposed recovery objects `ag_cycle_stage_checkpoints`,
  `ag_cycle_decision_writes`, and `ag_cycle_watch_writes` do **not** exist
  live. No public `ag_*` recovery functions are installed. This confirms the
  diagnostics/recovery design has not been accidentally deployed.

## Migration-history reconciliation

The Sep. 21–24 repository migrations were reconciled against the live catalog and recorded as applied without replaying their SQL bodies. Remote migration history now includes the complete audited chain through `20260924190000_ag_quantitative_watch_resolutions`. A subsequent least-privilege migration, `20261005151442_harden_ag_buy_authorization_table_privileges`, was applied and its repository timestamp aligned with production. The BUY authorization table now revokes direct `anon`/`authenticated` privileges while retaining RLS and service-role access.

## Required follow-up before any activation

1. Keep AG default-OFF and the legacy persistence hard block.
2. Preserve decision provenance with a separately reviewed schema migration
   (currently proposed as a nullable `notes text` column for compatibility
   with existing draft/application semantics); do not silently discard it.
3. Use `extensions.digest` in every recovery function and mirror that schema
   in disposable PostgreSQL tests.
4. Fence pre-era active AI decisions explicitly before atomic insertion.
5. Preserve the now-reconciled migration history; do not replay the Sep. 21–24 migration bodies. Keep future repository migration timestamps aligned with production history.
6. The disposable fixture now mirrors the live cross-era uniqueness index,
   pgcrypto schema and decision supersession trigger. Continue closing the
   remaining actual-schema differences (notably the intentionally proposed
   `notes` column and full RLS/role surface), then rerun role/RLS, retry,
   ambiguity, mixed-batch and watchlist tests.
7. Security-review all SECURITY DEFINER functions and grants independently
   before deployment.

This audit authorizes no migration, merge, deployment, AG run, or trade.
