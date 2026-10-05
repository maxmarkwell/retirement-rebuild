# AG cycle finalization migration review record

Status: **review candidate only — not applied to production**

## Exact candidate
- Path: `supabase/migration-candidates/20261005_ag_cycle_finalization_review_candidate.sql`
- Git blob SHA: `1423204e0570164f855d945732b0ee59b028b4cc`
- Production prerequisite: `20261005190736_ag_symbol_checkpoints`
- Accelerated Growth must remain **AG OFF** during review and migration application.

## Intended authority
The candidate adds one authenticated, paper-only RPC: `ag_finalize_daily_cycle(uuid,uuid)`.
It does not perform research, persistence writes, transaction execution, BUY sizing, or trading.

The caller must first obtain a live `finalized` stage claim through the already-deployed
`ag_claim_cycle_stage`. The database therefore requires a completed persistence stage
before finalization can even be claimed.

Inside one transaction the finalizer locks the finalization checkpoint and authoritative
cycle, verifies ownership and the open paper AG era, locks completed persistence evidence,
re-verifies Committee, holding-review, and watch manifests, then compare-and-swaps the
cycle from `running` to `completed` and completes the finalization checkpoint.

## Security expectations
- SECURITY DEFINER with empty `search_path`.
- `auth.uid()` required and must own the cycle/checkpoint.
- `anon` and `PUBLIC`: no EXECUTE.
- `authenticated` and `service_role`: EXECUTE.
- Paper-only: `paper_active`, `is_real_money=false`, open AG paper era.
- No transaction/execution function is referenced.

## Pre-production gate
- [ ] Exact candidate digest pinned in CI/review artifacts.
- [ ] Disposable PostgreSQL finalization behavior test passes.
- [ ] `ag-contracts` passes at exact reviewed head.
- [ ] `postgres-draft` passes at exact reviewed head.
- [ ] Production migration history rechecked immediately before apply.
- [ ] Production has no running AG cycle before apply.
- [ ] Security advisors reviewed immediately before apply.
- [ ] Explicit production DDL approval received.

## Postflight required if later approved
Verify function owner/security/search_path and exact EXECUTE grants; verify no running cycle
was mutated; rerun security advisors; record generated production migration version; keep
AG OFF. Production deployment/runner activation remains a separate approval boundary.
