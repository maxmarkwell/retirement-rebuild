# Retirement Rebuild — Operational Status and Session Handoff

**Updated:** 2026-10-15. **Status:** Snapshot; verify live repository, GitHub Actions, Vercel, and Supabase before acting.
**Strategic charter:** [RETIREMENT_REBUILD_VISION.md](./RETIREMENT_REBUILD_VISION.md). Read it first. This file is operational history, not permission to change production data or trade.

## System and guardrails

- Next.js on Vercel; GitHub `maxmarkwell/retirement-rebuild`; Supabase project `thtifuncwppsdrgsxmjy`.
- Vercel project `prj_F0YMSUWRY0t2vbngCGEYHN2BPJ5t`, team `team_Ywfs73QSstLmMdN2IwGM00tl`.
- Real Portfolio uses manually executed brokerage fills. AI judges ownership merit; the deterministic engine sizes buys. Do not place trades, enable automated execution, change investment records, or reconcile stalled cycles without explicit approval.
- UI names: Real Portfolio, Accelerated Growth, VOO Benchmark. AG working sleeve $40, reference capital $200. Control portfolios remain independent.
- Research decisions do not imply transactions; AG research endpoint explicitly forces `executeTransactions:false`.

## Critical unresolved incident — 2026-10-14

AG research initiated from iPhone around 5:20 PM Denver time. Cycle `583809c1-7157-4ad4-b343-56acc332a145` for `2026-10-14` remained `running` with `started_at=2026-10-14 23:20:05.308+00`, `completed_at=null`, no final counts. Earlier privileged read-only investigation found no stage/symbol checkpoints or attributable watch/decision writes for this cycle; absence of evidence is not proof that no external work or untracked partial write occurred. **Do not reset, mark failed, retry, or delete it without approval and full reconciliation.**

Root cause: `app/api/accelerated-growth/daily-cycle/route.ts` synchronously awaits research with `maxDuration=300`; timeout can terminate execution after a `running` row is inserted. `daily-cycle-work.ts` performs multiple non-atomic persistence actions. A cookie-authenticated `createClient()` is used in current pipelines, so moving work to service-role cron is **not** a drop-in refactor.

## Implemented and merged

- PR #46: mobile polling, stale-cycle warning, refresh.
- PR #47: cycle activity checkpoints.
- PR #48: block new AG cycles when an earlier day remains running.
- PR #49: previous-cycle reconciliation inventory UI.
- PR #51: correct audit-ledger inventory reads under RLS using server-only admin access after authenticated portfolio-scoped cycle lookup.
- PR #52: conservative recovery-policy module and nine fixtures.
- PR #53: CI workflow for fixtures and Next.js-generated TypeScript checks; initial run failed because `LayoutProps` needed `next typegen`; corrected run succeeded and PR merged.
- PR #54: SQL migration `supabase/migrations/20261015010000_ag_worker_stage_leases.sql` defining service-role-only stage claim, renewal, completion RPCs with claim-token fencing and refusal to automatically reclaim expired/failed stages. **Merged in Git, not confirmed applied in Supabase.** Vercel READY does not apply SQL migrations.

PR #54 merged SHA `da487f1366bc3a2cba9b522157a440a1e332d5db`, observed Vercel production READY. PR #53 merged SHA `d535ff879859617ff5c1de95fbbebaf7132edf49`. Recheck current deployment and migrations before assuming status.

## Open engineering work

**Issue #50:** durable independent AG research worker, with ownership/leases, checkpointing, idempotent persistence, and safe reconciliation. No worker has been implemented or connected. Existing `ag_cycle_worker_authorizations`, `ag_cycle_stage_checkpoints`, `ag_cycle_symbol_checkpoints`, `ag_cycle_watch_writes`, and `ag_cycle_decision_writes` tables exist. Some prior migrations for worker authorization and manual recovery are already present in Supabase; inspect their definitions before introducing competing RPCs.

Next actions:
1. Audit PR #54 SQL against the **existing** Supabase worker/recovery RPCs and privileges, including actual `auth.role()` semantics and PostgreSQL function security. Do not apply a conflicting migration.
2. Test lease claim races, expired lease refusal, wrong-token renew/complete, valid completion, and recovery requirements in an isolated environment. Test DB behavior; a Vercel build is insufficient.
3. Build an independently invoked, authenticated worker that does not depend on the initiating browser request or user cookie; implement scoped authorization and claim-token fencing across side effects.
4. Add durable research outputs and atomic/idempotent write ledgers; reject unsafe retries and double writes.
5. Perform full read-only reconciliation of the Oct 14 cycle, then **ask for explicit approval** before modifying its database status or initiating a new research cycle.
6. Keep AG execution disabled until separate approval and evidence-based acceptance testing.

**Additional caution:** An attempt to create `lib/discovery/accelerated-growth/worker-stage-lease.ts` on branch `feat/ag-stage-lease-client` was blocked by the repository tool; do not assume the file exists. Inspect branches and tree.

## Other work and strategy

- PR #45: benchmark comparison alignment, previously open/unmerged; verify current state.
- PR #42: older UI wording, previously open/unmerged; do not merge without reviewing unwanted terminology.
- Snapshot automation had a scheduled verification around 2026-10-15 5:30 PM Denver; verify independently.
- Discovery v2 direction and five independent opportunity paths are defined in the vision charter. See other `docs/AG_DISCOVERY_V2_*.md` files for protocols and evidence requirements.
- Scale real capital only with reliable behavior; $200 to $500 to $1,000 to $2,500 are review checkpoints, not automatic actions.

## Instructions for the next ChatGPT session

**First read** `docs/RETIREMENT_REBUILD_VISION.md` and **this document** in the GitHub repository. Then inspect live GitHub PRs/issues, current `main`, GitHub Actions, Vercel production, and Supabase migrations and read-only cycle evidence. Treat this document as a dated handoff, not authoritative live state. Continue implementing and validating durable AG worker reliability in small tested increments, not just creating issues or reports. Never infer a SQL migration is applied from a successful Vercel deployment. Preserve Oct 14 cycle and real-money controls until the user explicitly approves a specific consequential action.


## October 26, 2026 — AG VRT BUY milestone and deterministic sizing review

**This section supersedes older AG research-stage status above only where explicitly stated.** Preserve the October 14 cycle incident and its recovery restrictions until separately verified and resolved.

### Verified research milestone, not execution

Vertiv Holdings (VRT) passed four authenticated read-only diagnostics: quantitative Discovery **ADVANCE** through `SUSTAINED_HIGH_GROWTH`, Catalyst **SUPPORTED**, Deep Research **PROCEED**, and Investment Committee **BUY**. The October 26 research-stage result did **not** persist an active Committee BUY decision, create a proposed allocation, or execute a paper or real-money transaction. The Committee's ownership-merit judgment does not determine shares, capital allocation, or entry price. Valuation and cash-flow normalization remain material research caveats. A later earnings event was scheduled for October 28; reassessment must use up-to-date evidence.

PR #94 (`18a3c014b3b66d8d9b6c241edcdd9b37314c423c`) introduced the sustained-high-growth research qualification path and was reported merged and deployed READY in the handoff. This is a research admission path, **not** an automatic BUY or portfolio execution bypass.

### Verified code path for AG paper sizing (inspection on October 26)

- `lib/discovery/accelerated-growth/committee-pipeline.ts`: `persistAgCommitteeDecisions` requires an authenticated user, `paper_active` portfolio and open paper AG era, and guards against reusing an executed BUY. The VRT read-only preview did not invoke this persistence.
- `lib/discovery/accelerated-growth/daily-cycle-work.ts`: `runAgResearchDailyCycle` throws `AG_PAPER_EXECUTION_DISABLED` if `executeTransactions: true` is requested; it calls the execution orchestrator with execution disabled.
- `lib/discovery/accelerated-growth/daily-cycle-execution.ts`: `executeAgDailyCycleTransactions` delegates an enabled BUY to `executeAgPaperBuy`. This does not make direct calls to the separate executor safe for a preview.
- `lib/discovery/accelerated-growth/paper-execution.ts`: `executeAgPaperBuy` checks authentication, unexecuted active Committee BUY, paper portfolio and era, decision age and persisted evidence; loads transactions/contributions, computes AG accounting, reconstructs holdings, values positions, assesses theme exposure and drawdown; evaluates guardrails and `sizeAgBuy`; **then can advance a persisted high-water mark, insert authorization and invoke the transaction-writing `execute_ag_paper_buy_authorized` RPC**. Never invoke this executor for a read-only sizing preview.
- `lib/discovery/accelerated-growth/portfolio-guardrails.ts`: `evaluateAgPortfolioGuardrails` checks sleeve, theme and position caps; at least $5 cash; valid thesis/liquidity; and the 20% sleeve drawdown review circuit breaker. Adds additionally require completed reassessment.
- `lib/discovery/accelerated-growth/risk-sizing.ts`: `sizeAgBuy` uses 20% AG sleeve, 5% single-position, 10% theme, and 50%-of-position-cap starter target; $5 minimum BUY notional and three-decimal share quantities. No AI sizing is involved. The separate generic `lib/portfolio/position-sizing.ts` is **not** the AG executor sizing function.
- `lib/discovery/accelerated-growth/execution-evidence.ts`: liquidity evidence requires at least 50,000 daily shares and $1 million daily dollar volume and supplies theme attribution.

At **$200 reference capital** only, these percentage limits imply a $40 AG sleeve cap, $10 position cap, $5 starter target and $20 theme cap. These are examples of code-defined limits, **not live AG portfolio readings or an authorized allocation**.

### Unverified / next controlled step

Current AG paper cash, holdings, contributions, theme allocation, quote, high-water mark and exact live VRT eligibility are **not verified**. The normal AG candidate selector has not been shown to select VRT. There is no verified read-only end-to-end VRT sizing preview. Before proposing an endpoint, inspect the relevant existing AG accounting/valuation functions and a candidate diagnostic-route authentication pattern; refactor the read-only calculation boundary if necessary, without calling `executeAgPaperBuy`, advancing the high-water mark, creating authorizations, persisting decisions or writing transactions. Add regression coverage for cash, liquidity, concentration, executed/duplicate decision, circuit breaker, and paper-versus-real isolation; then run TypeScript and CI checks and open a separate focused code PR.

**Do not enable AG paper execution, initiate research cycles, alter the real portfolio, or treat the VRT Committee preview as an executed holding.**
