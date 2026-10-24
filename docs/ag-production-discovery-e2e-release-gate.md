# Production discovery end-to-end release gate

**Blocking gate for AG paper BUY activation.** A Vercel READY build and passing BUY tests do not establish that the user-facing discovery workflow works.

## Existing production failure
- Production `POST /api/accelerated-growth/daily-cycle` awaits `runAgResearchDailyCycle` inside a request with `maxDuration=300`.
- Work includes holding review, discovery, deep research, Committee decisions and multiple persistence stages.
- Request timeout can leave the cycle in an ambiguous running/partially persisted state.
- The October 14 cycle `583809c1-7157-4ad4-b343-56acc332a145` is protected: read-only reconciliation first; do not reset, retry, fail, delete or mutate without explicit authorization.

## Mandatory test matrix
1. **Production UI preflight (read-only):** Open the production discovery page, confirm signed-in session, current cycle status, current strategy era and that any earlier unfinished cycle blocks new work. Record timestamps, UI state and network response.
2. **Blocked-start safety:** With an unresolved prior cycle, attempt to start discovery only after confirming the endpoint returns a no-write 409 guard. Verify no new cycle, decision, watchlist or transaction rows were created. Do not use `retryFailed=true`.
3. **Normal full discovery (only after reconciliation):** Start from the production website with the smallest supported candidate count. Record request status, cycle ID, progress and completion. Verify persisted watchlist, Committee decisions and final cycle counters agree with the UI. Require `transactionsWritten=false` while BUY execution is disabled.
4. **Timeout/interruption:** In a controlled test (not by interrupting the protected historical cycle), simulate worker/request timeout and verify durable progress survives, recovery state is unambiguous, and a duplicate click cannot spawn duplicate research or decisions.
5. **Cross-day guard:** An unfinished earlier-day cycle must block a new-day cycle until reconciliation; never silently replace it.
6. **Refresh/revisit:** Refresh the browser mid-run and after completion. Status must be recoverable from durable server state, not dependent on the original HTTP response.
7. **BUY handoff:** Only completed, reconciled and validated Committee BUY decisions may reach a separately approved paper BUY path; SELL and real-money execution remain off.

## Evidence for pass
- Screenshot or recorded UI states at start, running, completion/failure.
- Network status and response for each user action.
- Cycle IDs and timestamps; database row counts and decision links.
- No duplicate decisions or transactions.
- Confirmed terminal cycle status and UI/database agreement.
- Explicit evidence that an interrupted request does not strand the workflow.

## Release rule
**FAIL** until an end-to-end production-website discovery completes and the timeout/recovery behavior is validated. No AG paper BUY activation before this gate passes.

## Cost/safety
Use existing infrastructure. Do not create paid Supabase branches. Do not touch the protected October 14 cycle without explicit authorization. Do not use real-money trading to test discovery.
