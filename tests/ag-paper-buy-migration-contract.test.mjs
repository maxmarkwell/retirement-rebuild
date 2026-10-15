import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const migration = readFileSync(
  new URL("../../supabase/migrations/20261015020000_ag_paper_buy_portfolio_lock.sql", import.meta.url),
  "utf8",
);

test("AG BUY executor locks portfolio before reading sleeve capacity", () => {
  const portfolioLock = migration.indexOf("where id=v_auth.portfolio_id and user_id=v_auth.user_id for update;");
  const capacityRead = migration.indexOf("v_reference:=v_era.reference_total_capital");
  const transactionsRead = migration.indexOf("from public.transactions where portfolio_id=v_portfolio.id");
  assert.ok(portfolioLock > 0, "portfolio lock must exist");
  assert.ok(capacityRead > portfolioLock, "lock must precede capacity evaluation");
  assert.ok(transactionsRead > portfolioLock, "lock must precede transaction totals");
});

test("AG BUY executor still requires a paper-only portfolio and active decision", () => {
  assert.match(migration, /v_portfolio\.type<>'paper_active' or v_portfolio\.is_real_money/);
  assert.match(migration, /v_decision\.transaction_id is not null/);
  assert.match(migration, /v_auth\.consumed_at is not null/);
});

test("AG BUY executor preserves starter sizing and sleeve cap checks", () => {
  assert.match(migration, /v_net\+round\(v_auth\.gross_amount,2\)>v_sleeve_cap/);
  assert.match(migration, /v_auth\.quantity<>v_min_qty/);
});
