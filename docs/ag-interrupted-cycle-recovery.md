# Accelerated Growth interrupted-cycle recovery plan

Status: diagnostic design; no automatic recovery is enabled.

## Production evidence (2026-10-02 export)
- 2026-09-24 is the only full production research cycle shown completed: 1,741 universe, 22 evaluated, five ADVANCE, five deep research completions, one PROCEED, one Committee decision.
- Five later cycles (September 25, 28, 29 and October 1–2) were recorded as running with null completion metrics at export time.
- This is consistent with an interrupted request, **not proof of a Vercel timeout**. The 2026-09-24 cycle took ~13 minutes, so do not assume the route's `maxDuration=300` matches the actual runtime configuration.
- The earlier synthetic 1701/1892/1900 dates are fixtures, not production research history.

## Safe diagnostic sequence
1. Inspect Vercel production logs for POST /api/accelerated-growth/daily-cycle on each affected date. Match request start time and look for timeout, crash, network failure or missing terminal log. Do not use preview logs to infer the historical production cause.
2. Deploy diagnostic changes only after review. Use phase logs to identify holding review, Discovery, individual catalyst/deep research, Committee or persistence as the final reached stage.
3. Read the scoped status endpoint. `staleCycles` reports historical rows older than 20 minutes; this is a **heuristic**, not permission to retry. Verify no still-active request before recovery.
4. Read-only inspection of decision rows and research WATCH timestamps around the affected start times. Existing Committee decisions are keyed by ticker/status, not cycle ID, so timestamps alone do not prove exactly which cycle wrote them.
5. Never bulk-update `running` rows to `failed` or trigger `retryFailed` until partial persistence and duplicate protections have been audited.

## Recovery design prerequisites
- Persist a per-cycle phase/checkpoint before and after expensive research and before every persistence phase. Preserve per-candidate completed outputs so recovery does not re-spend AI calls.
- Use durable cycle-scoped idempotency keys for Committee decision writes and WATCH resolutions. Existing active-decision reuse is helpful but insufficient for a fully atomic replay.
- Explicitly distinguish stale/abandoned from failed, with a compare-and-swap lease or equivalent mechanism preventing concurrent recovery.
- Do not mark a cycle completed unless all required writes succeed; record the last successful phase and safe failure reason. Avoid logging full research theses or secrets.
- Keep `executeTransactions: false` in the production route and retain existing paper risk limits.
- Add tests: healthy running cycle not reclaimed; stale cycle flagged but not auto-retried; interrupted research resumes without duplicate AI calls; partial persistence replay creates no duplicate active decisions; concurrent recovery loses safely; completion metrics accurately reflect committed outputs.

## Read-only SQL to inspect suspicious cycles
```sql
SELECT cycle_date, status, started_at, updated_at, completed_at,
       EXTRACT(EPOCH FROM (COALESCE(completed_at, NOW()) - started_at))/60 AS elapsed_minutes,
       failure_message, universe_count, evaluated_count, deep_research_completed_count,
       committee_decision_count, persisted_decision_count
FROM ag_daily_cycles
WHERE cycle_date >= DATE '2026-09-24'
ORDER BY started_at DESC;
```
Do not run any production mutation as part of this diagnostic plan.
