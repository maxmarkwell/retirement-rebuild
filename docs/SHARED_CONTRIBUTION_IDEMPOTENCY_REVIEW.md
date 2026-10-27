# Single-entry contribution: database idempotency review

Status: **proposed / not applied**. Existing contribution posting remains unchanged.

## Findings
The current `contributions` table has `id, user_id, portfolio_id,
amount, contribution_date, notes, created_at` and no idempotency key.
The server action currently accepts a user-selected portfolio. That
behavior must not become the authoritative shared-account posting path.

## Proposed safety boundaries
1. Retain historical rows unchanged. Make `idempotency_key` nullable so legacy rows remain valid.
2. Require a new 16–128-character request key on the **future** shared contribution endpoint; uniquely index the pair `(user_id, idempotency_key)`.
3. Authorize exactly one `type=real`, `is_real_money=true` portfolio owned by the authenticated user, server-side. Do not trust a supplied portfolio ID.
4. Enforce positive whole-cent amounts, valid calendar dates, and matching request payload on key reuse; repeated keys must return the existing result, never insert another record.
5. Use an atomic insert with database unique constraint and race-safe conflict handling. A read-before-write check alone is inadequate.
6. Verify RLS/ownership for `contributions`, avoid service-role exposure and preserve all other portfolio workflows.
7. Confirm brokerage funding externally first. Recording a contribution represents an actual confirmed deposit, not an instruction to transfer funds.
8. Reconcile new deposits against a single shared cash balance; paper AG should never receive a duplicate contribution.

## Before applying
- Review exact existing DB constraints and RLS policies.
- Check for migration name and constraint conflicts in production.
- Add atomic integration tests for concurrent duplicate requests, conflicting repeated payloads, failed authorization, and legacy rows.
- Integrate through a separate, reviewable PR. No trades or external fund transfers.
