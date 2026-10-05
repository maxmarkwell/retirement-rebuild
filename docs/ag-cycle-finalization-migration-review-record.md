# AG cycle finalization migration review record

Status: **applied to production and postflight verified**

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
- [x] Exact candidate digest pinned in CI/review artifacts.
- [ ] Disposable PostgreSQL finalization behavior test was not completed: GitHub Actions runner remained queued and was cancelled; controlled-production fallback was used.
- [x] `ag-contracts` passed at exact reviewed head `0bb81c7dff51909741cc856b3147cd5c97d7efb1`.
- [ ] `postgres-draft` did not execute; its GitHub runner remained queued and the run was cancelled.
- [x] Production migration history rechecked immediately before apply.
- [x] Production had zero running AG cycles and zero recovery/checkpoint ledger rows before apply.
- [x] Security advisors reviewed immediately before apply.
- [x] Controlled production testing authorized by the project owner.

## Postflight required if later approved
Verify function owner/security/search_path and exact EXECUTE grants; verify no running cycle
was mutated; rerun security advisors; record generated production migration version; keep
AG OFF. Production deployment/runner activation remains a separate approval boundary.


## Production application evidence — 2026-10-05
- Applied migration: `20261005210544_ag_cycle_finalization`.
- Exact candidate Git blob: `1423204e0570164f855d945732b0ee59b028b4cc`.
- Live schema confirmed required cycle columns: `completed_at`, `failure_message`, `persisted_decision_count`, and `updated_at`.
- Live decision/watch persistence RPCs lock the running `persistence` checkpoint `FOR UPDATE` before durable writes, providing the intended finalizer fence.
- Postflight: SECURITY DEFINER=true; `search_path=''`; PUBLIC EXECUTE=false; anon=false; authenticated=true; service_role=true.
- Postflight state remained zero running cycles, zero stage checkpoints, zero symbol checkpoints, zero decision-ledger rows, and zero watch-ledger rows.
- Security advisor anonymous SECURITY DEFINER warnings remained at 4. Authenticated SECURITY DEFINER warnings increased from 20 to 21 solely because the new authenticated finalizer is now deployed.
- AG remained OFF. No research, persistence replay, paper transaction, or real-money transaction was executed as part of migration application.
