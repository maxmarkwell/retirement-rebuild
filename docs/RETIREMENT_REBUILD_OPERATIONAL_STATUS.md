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


## Update — 2026-10-26: VRT completes AG research funnel with read-only BUY

**Newer evidence than the 2026-10-15 snapshot above.** The earlier unresolved-cycle/worker cautions remain open until independently reconciled; this section does not assert that they were resolved.

### Shipped and verified
- PR [#94](https://github.com/maxmarkwell/retirement-rebuild/pull/94) merged into `main` (squash SHA `18a3c014b3b66d8d9b6c241edcdd9b37314c423c`). It added a bounded **SUSTAINED_HIGH_GROWTH** Discovery qualification path, allowing strong sustained growers to reach research without rewriting the acceleration score or creating BUYs. Regression CI passed.
- Production Vercel deployment `dpl_8PYdNUQx5EdMYuSCNgddXujaCi4L` was observed READY for that SHA at `https://retirement-rebuild.vercel.app`. Verify current deployment again in the next session.
- Authenticated read-only VRT Discovery diagnostic returned `ADVANCE` through `SUSTAINED_HIGH_GROWTH` (baseline `REVIEW`); Catalyst Research returned `SUPPORTED`, confidence 0.8; Deep Research returned `PROCEED`; Investment Committee preview returned **`BUY`**.
- Committee preview completed HTTP 200 on 2026-10-26. Response explicitly stated `mode: read_only`, `executionEnabled: false`, `decisionsPersisted: false`, `transactionsWritten: false`. **No persisted VRT decision, paper transaction, or brokerage trade is established by this test.**
- Committee snapshot quote was $200.325 on 2026-10-26, vendor market cap ~$77.048B, enterprise value ~$77.575B, P/E 44.48x, P/S 6.71x, TTM revenue $11.480B, TTM net income $1.732B, TTM FCF $2.924B, P/FCF 26.35x. SEC historical-share diagnostic broadly agreed with vendor valuation; working-capital quality and incomplete components require caution. Committee's BUY acknowledged valuation/execution risk, backlog conversion uncertainty, and UIG as optional rather than required upside. Earnings scheduled 2026-10-28; verify the actual release before relying on pre-earnings research.
- Read-only API routes: `GET /api/accelerated-growth/discovery-preview?symbol=VRT`, `GET /api/accelerated-growth/catalyst-preview?symbol=VRT`, `POST /api/accelerated-growth/deep-preview` body `{catalyst}`, and `POST /api/accelerated-growth/committee-preview` body `{research}`. The latter returns `decision`, `valuationSnapshot`, and `valuationNarrativeAudit`. Authenticated user/browser session and open AG paper strategy era required. Research calls consume model usage.
- The production `GET /api/accelerated-growth/committee` diagnostic is disabled; `GET /api/accelerated-growth/research-preview?max=5` is read-only but uses dynamic candidate selection and does **not** guarantee VRT selection.

### Current next task — deterministic AG paper sizing and decision lifecycle

The user wants to continue from the first VRT Committee BUY into a **controlled, read-only validation of the AG paper portfolio's deterministic BUY eligibility, position sizing, available cash, and concentration controls**. Do not assume a Committee BUY implies executable eligibility or a position. Inspect the real code path and current portfolio state first; if necessary, propose a narrowly scoped read-only VRT sizing preview, with tests, before any database writes. No such sizing preview or sizing verification was completed in the handoff session.

Inspected `lib/discovery/accelerated-growth/committee-pipeline.ts`: `persistAgCommitteeDecisions` restricts writes to `paper_active` with an open `accelerated_growth` paper era; derives BUY liquidity/theme evidence from dynamic universe; reuses or supersedes active decisions under lifecycle rules and refuses an already-executed BUY. It does **not** set recommended quantity/allocation; those remain null. `lib/discovery/accelerated-growth/execution-evidence.ts` checks volume >= 50,000 shares and dollar volume >= $1M. `lib/discovery/accelerated-growth/committee.ts` explicitly forbids the AI Committee from sizing. Actual sizing code path remains to be traced and verified.

**Absolute constraint:** User alone executes all real-money brokerage purchases. Do not build, propose, enable, or test automatic brokerage buying. Real Portfolio stays isolated; AG remains paper-only and execution-disabled absent specific approval. Research preview is not authorization to persist a BUY, modify positions, initiate cycles, or execute paper trades. The Oct 14 stalled-cycle reconciliation and durable worker backlog remain separately unresolved.

### Next-session sequence

1. Read the vision charter and this operational document, verify `main`/deployment and relevant Supabase state.
2. Trace AG paper sizing/execution eligibility from UI/API through deterministic engine and cash/holdings/limits. Identify whether read-only sizing can be safely evaluated for the existing VRT Committee result.
3. Test the sizing and duplicate-decision safeguards without writing to production, with targeted regression tests and PR review if code changes are needed.
4. Separately revisit VRT after Oct 28 earnings before any actual capital decision. Preserve all prior controls and require explicit user approval for consequential actions.

