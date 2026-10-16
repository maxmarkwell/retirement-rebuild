# AG paper BUY concurrency integration test plan

**Status:** NOT EXECUTED. Run only in an isolated Supabase development database with synthetic data. Never run against the production project or real-money portfolio.

## Preconditions
1. Create an isolated Supabase branch with explicit cost approval. Verify branch project ref differs from production.
2. Apply repository migrations to the isolated branch, including `20261015020000_ag_paper_buy_portfolio_lock.sql`. Confirm the executor's portfolio lookup uses `FOR UPDATE`.
3. Seed synthetic user, `paper_active` portfolio (`is_real_money=false`), active AG paper strategy era, two distinct valid Committee BUY decisions and two valid authorizations. Honor all foreign keys, RLS, theme, starter sizing, freshness and minimum-notional requirements.
4. Choose a reference capital and existing synthetic transactions such that **each** new authorized BUY fits remaining sleeve capacity individually, but **both together exceed** the 20% AG sleeve cap.
5. Record baseline transaction count, decisions, authorizations, and sleeve utilization.

## Concurrent test (two independent database sessions)
- Session A: begin transaction; acquire portfolio row lock for the synthetic portfolio; keep transaction open while session B begins execution for decision B.
- Session B: call `execute_ag_paper_buy_authorized(auth_B)` asynchronously in its own session; verify it waits for the portfolio lock rather than reading and committing against stale capacity.
- Session A: execute `execute_ag_paper_buy_authorized(auth_A)` in the same transaction, then commit.
- Session B: resume; verify it fails the sleeve cap check, and that B's decision and authorization remain unconsumed/unexecuted.
- Verify exactly one new BUY transaction, correctly linked to decision A; aggregate sleeve deployment must remain <= 20% of reference capital.

## Retry and isolation cases
- Retry authorization A: must reject as consumed; no additional transaction.
- Retry decision A using a new authorization: must reject because decision already executed.
- Run valid BUY on a different synthetic portfolio: must not be blocked by the first portfolio's lock.
- Attempt a BUY for `is_real_money=true` or non-`paper_active` portfolio: must reject.
- Force a failure after entering the executor within a transaction and roll back: no partial transaction, decision linkage, or authorization consumption should persist.

## Evidence required to close the gate
Capture branch project ref (not secrets), migration version, test timestamps, concurrent session traces, SQLSTATE/error messages, before/after row counts, decision links, authorization consumption and sleeve totals. Remove synthetic data or delete the branch after verification and approval.

**Do not enable AG automated BUYs based only on static migration tests or a Vercel READY deployment.**
