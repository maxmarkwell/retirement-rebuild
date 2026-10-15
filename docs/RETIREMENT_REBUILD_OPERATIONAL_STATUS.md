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
