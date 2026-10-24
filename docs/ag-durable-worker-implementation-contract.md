# Accelerated Growth durable worker: implementation contract

Status: engineering design only. No production cycle changes or trading authorization.

## Existing problem

The POST route awaits the entire research pipeline with maxDuration=300. Stage lease RPCs exist in Supabase, but the pipeline does not call them and cannot resume from committed stage outputs. Wrapping the monolith in a lease is not a durable worker.

## Required design

1. Preserve authenticated paper_active portfolio and open accelerated_growth paper-era checks, including the cross-day unfinished-cycle block, before creating work.
2. Create an idempotent cycle request and return an immediate cycle ID/status response. Duplicate submissions must not start duplicate research.
3. Use server-only worker identity and service-role access. Authorize a specific cycle and predecessor-completed stage before claiming its lease. Never trust browser-supplied worker credentials or arbitrary cycle IDs.
4. Extract bounded holding-review, discovery, catalyst/deep-research, committee, persistence, and finalize stages. Commit versioned, validated outputs between stages. Resume only from persisted outputs, not implicit recomputation. Use per-symbol checkpoints for expensive research.
5. Fence **every** stage output and side-effect write with a valid claim token and lease, not only the final completion RPC. An expired lease must prevent writes. The current claim RPC deliberately rejects takeover of expired or failed stages pending manual reconciliation.
6. Use idempotency keys and durable decision/watch write ledgers. Validate counts and transaction absence before completion. Timeouts and uncertain partial writes remain blocked for review.
7. Schedule bounded worker invocations using existing infrastructure only after verifying Hobby-plan constraints. Do not rely on unawaited work after returning an HTTP response.
8. Keep executeTransactions=false; paper BUY and SELL remain disabled. Future BUY authorization must be server-derived from a completed reconciled cycle, never caller-provided approval flags. E*TRADE real trades remain manual.

## Protected cycle

The October 14, 2026 cycle 583809c1-7157-4ad4-b343-56acc332a145 is protected and remains pending reconciliation. Do not claim, reset, retry, fail, delete, or alter it automatically. Do not bypass the prior-day guard.

## Release gates

- Static tests: cross-day guard, authentication, paper-only scope, no execution, no automatic expired-lease takeover.
- Integration tests: lease fencing on writes, restart from committed output, duplicate worker invocations, crash before/after persistence, count reconciliation, status after browser refresh.
- Production end-to-end: after separately approved reconciliation, start discovery from the live website, verify all stage checkpoints, decision linkage, counts and zero transactions, then consider a separate paper-BUY release.

## Sequence

Implement stage fencing and durable outputs first; extract bounded pipeline stages second; add HTTP request/worker handoff third; test and deploy last. Do not advertise resumability until these conditions are met.
