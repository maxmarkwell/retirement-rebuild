# AG atomic persistence: isolated database acceptance tests

**Status:** draft acceptance specification. Selected cases pass against a deliberately simplified disposable PostgreSQL fixture in GitHub Actions; this is **not** actual-schema integration or evidence of a live migration. See `ag-release-acceptance-gate.md` for tested scope and outstanding blockers.

## Test environment

Use a disposable Supabase/PostgreSQL instance with the *actual* Retirement Rebuild schema, approved checkpoint/ledger migrations, and the reviewed RPC. Never run destructive tests on production. Create two authenticated users, one active AG paper portfolio, one real-money portfolio, and isolated strategy eras. Seed representative active Committee BUY/WATCH/REJECT and holding HOLD/SELL decisions. Disable transaction execution and outbound research.

## Required cases

| Test | Action | Pass condition |
|---|---|---|
| Successful insert | Claim persistence and submit a new ticker | Exactly one active decision and one committed ledger row with matching decision ID |
| Replacement | Existing active decision differs from incoming decision | Old row superseded and replacement active, ledger committed in one transaction |
| Same-type new-cycle snapshot | Existing active decision has the same type but different incoming thesis | Prior row superseded and new decision inserted with new content; ledger points to new row |
| Same-cycle retry | Repeat the exact same cycle/ticker/payload after commit | Existing ledger decision ID returned; no duplicate inserted |
| Forced INSERT failure | Add a temporary test-only trigger that raises an exception on replacement INSERT | Old decision remains active; no committed ledger entry or replacement row |
| Same-cycle concurrency | Two sessions submit the same cycle/ticker/payload | Both resolve to the same committed decision ID; one effective write |
| Conflicting retry | Same cycle/ticker but different payload | Second call fails; original decision and ledger remain unchanged |
| Cross-cycle concurrency | Two claimed cycles target the same portfolio/ticker | Locking prevents duplicate active rows; stale cycle must not silently overwrite a newer cycle |
| Timeout after COMMIT | Commit, then simulate lost HTTP response | Read-only ledger lookup identifies committed decision; no blind replay |
| Expired lease | Submit after claim expiration | RPC rejects write; no changes |
| Wrong token | Submit with another claim token | RPC rejects write; no changes |
| Cross-user | User B attempts User A's cycle | RPC rejects write; no changes |
| Real-money | Point test cycle at a real-money portfolio | RPC rejects write; no changes |
| Multiple active decisions | Seed conflicting active rows | RPC fails closed without modifying them |
| Invalid payload | Bad ticker, unsupported kind/type, same-key changed payload | RPC rejects; no changes |
| RLS | Attempt direct ledger insert/update as authenticated user | Denied; only approved RPC may write |

## Current design blockers to resolve before running

1. Verify live column types, NOT NULL constraints, default values, decision confidence range and actual pgcrypto extension schema. Draft SQL has not been compiled against the real database.
2. Payload hash is derived from typed RPC arguments inside PostgreSQL; isolated fixture tests exercise deterministic matching and conflicting retries, but the installed live digest extension and schema remain unverified. A separate draft verifier compares frozen full Committee argument arrays to ledger hashes; upstream manifest provenance and integration into locked completion remain unresolved. No client-supplied hash is accepted.
3. A per-ticker RPC is atomic **per decision**, not across the entire batch. A failure between tickers requires durable per-ticker reconciliation; watchlist updates also need their own idempotency contract.
4. Cross-cycle ordering: an advisory lock serializes concurrent operations but does not prove that an older cycle cannot overwrite a newer completed decision. Add an explicit cycle ordering/fencing check.
5. Review the deliberate lifecycle change: new cycles snapshot even same-type decisions rather than reuse a potentially stale row. Verify Committee execution-evidence fields and downstream decision-history consumers; confirm that no real-money execution path invokes this RPC.
6. Tests must run as actual authenticated roles, not just as a database superuser. Include simultaneous database sessions for concurrency tests.

**Release gate:** no AG research restart until migrations are reviewed, database tests pass, checkpoint stage execution is wired, reconciliation is demonstrated, and the paused endpoint is deliberately re-enabled. A Vercel READY build alone is insufficient.
