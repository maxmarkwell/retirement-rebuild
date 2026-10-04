# AG persistence recovery audit (READ ONLY)

Run these queries in the Supabase SQL editor **before** approving any interrupted-cycle recovery. They do not change data. Replace the cycle timestamps and portfolio ID with the cycle under review. Because existing decisions do not contain a cycle ID, the results are **evidence for manual reconciliation, not proof of exact cycle attribution**.

```sql
-- 1. Cycle status and recorded counts. Replace the ID.
SELECT id, cycle_date, status, started_at, completed_at, updated_at,
       failure_message, committee_decision_count, persisted_decision_count
FROM public.ag_daily_cycles
WHERE id = 'REPLACE_WITH_CYCLE_UUID'::uuid;

-- 2. Decisions written during the cycle's observed window.
-- Do not rely on this query alone: superseding an older decision updates
-- an existing row and may not create a new decision in this window.
WITH cycle AS (
  SELECT portfolio_id, started_at,
         COALESCE(completed_at, updated_at, now()) AS window_end
  FROM public.ag_daily_cycles WHERE id = 'REPLACE_WITH_CYCLE_UUID'::uuid
)
SELECT d.id, d.ticker, d.decision_type, d.status, d.source,
       d.transaction_id, d.created_at
FROM public.investment_decisions d CROSS JOIN cycle c
WHERE d.portfolio_id = c.portfolio_id
  AND d.created_at BETWEEN c.started_at - interval '2 minutes'
                       AND c.window_end + interval '2 minutes'
ORDER BY d.created_at, d.ticker;

-- 3. Current active/superseded decision state for the affected portfolio.
-- Include the complete decision history; an interrupted supersede may
-- have occurred without a corresponding replacement INSERT.
WITH cycle AS (
  SELECT portfolio_id FROM public.ag_daily_cycles
  WHERE id = 'REPLACE_WITH_CYCLE_UUID'::uuid
)
SELECT d.id, d.ticker, d.decision_type, d.status, d.source,
       d.transaction_id, d.created_at
FROM public.investment_decisions d JOIN cycle c
  ON d.portfolio_id = c.portfolio_id
WHERE d.source = 'ai_committee'
ORDER BY d.ticker, d.created_at DESC;

-- 4. Independently inspect transaction records during the observed window.
WITH cycle AS (
  SELECT portfolio_id, started_at,
         COALESCE(completed_at, updated_at, now()) AS window_end
  FROM public.ag_daily_cycles WHERE id = 'REPLACE_WITH_CYCLE_UUID'::uuid
)
SELECT t.* FROM public.transactions t CROSS JOIN cycle c
WHERE t.portfolio_id = c.portfolio_id
  AND t.created_at BETWEEN c.started_at - interval '2 minutes'
                       AND c.window_end + interval '2 minutes'
ORDER BY t.created_at;

-- 5. Inspect unresolved research watches. Changes to an existing watch
-- may have occurred without a newly created row.
WITH cycle AS (
  SELECT portfolio_id FROM public.ag_daily_cycles
  WHERE id = 'REPLACE_WITH_CYCLE_UUID'::uuid
)
SELECT w.* FROM public.ag_research_watchlist w JOIN cycle c
  ON w.portfolio_id = c.portfolio_id
ORDER BY w.ticker, w.updated_at DESC;
```

## Reconciliation decision

- Record the exact candidate tickers and intended decision payloads from durable checkpoints. If unavailable, do not infer them from today's research.
- Compare each ticker's complete decision history, current active decision, transaction linkage and watchlist status.
- If any write may have partially succeeded, mark persistence `needs_manual_review`. Never reset its checkpoint to `pending` based solely on a timeout.
- A new atomic persistence RPC must take a cycle ID and stable per-decision idempotency keys, lock the cycle and affected decision rows, and commit supersession and insertion in **one database transaction**.
- Do not enable transaction execution during recovery. Any transaction already present must be reconciled separately.
- Verify the audit queries against live schema before executing them; this is a proposed runbook, not evidence that reconciliation is complete.
