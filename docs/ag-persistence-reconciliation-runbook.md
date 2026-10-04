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

## Future ledger-based timeout recovery (only AFTER proposed migrations are approved)

The following query requires `ag_cycle_decision_writes` and
`ag_cycle_stage_checkpoints`, which **do not exist in the current schema**.
Do not run it against today's production database. It provides a read-only
post-timeout check once the proposed tables have been deployed and reviewed.

```sql
-- Replace the UUID and compare the complete result with the durable
-- expected checkpoint payload and the original request's payload hashes.
SELECT c.id AS cycle_id, c.cycle_date, c.status AS cycle_status,
       s.status AS persistence_stage_status, s.completed_at AS stage_completed_at,
       l.ticker, l.decision_kind, l.payload_hash,
       l.status AS write_status, l.investment_decision_id,
       l.committed_at, d.status AS decision_status,
       d.decision_type, d.transaction_id
FROM public.ag_daily_cycles c
LEFT JOIN public.ag_cycle_stage_checkpoints s
  ON s.cycle_id = c.id AND s.stage = 'persistence'
LEFT JOIN public.ag_cycle_decision_writes l ON l.cycle_id = c.id
LEFT JOIN public.investment_decisions d ON d.id = l.investment_decision_id
WHERE c.id = 'REPLACE_WITH_CYCLE_UUID'::uuid
ORDER BY l.ticker;
```

A `committed` ledger entry with the expected hash and a matching decision ID
is evidence that **that individual decision write** committed. It does not
prove the watchlist was updated, that all expected tickers were processed, or
that the persistence stage completed. A reused decision can subsequently be
superseded by another cycle, so `decision_status = 'superseded'` is not by
itself proof that the original write failed. Reconcile against the original
checkpoint and later cycle history before deciding whether the entire stage
is complete. Missing or mismatched ledger rows require manual review; do not
blindly rerun a timed-out persistence stage.
