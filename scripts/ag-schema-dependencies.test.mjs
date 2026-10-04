import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const read = (path) => readFileSync(path, "utf8").toLowerCase();
const rpc = read("docs/ag-atomic-decision-rpc-draft.sql");
const cycles = read("supabase/migrations/20260923090000_ag_daily_cycles.sql");
const eras = read("supabase/migrations/20260917120000_accelerated_growth_strategy_eras.sql");
const decisions = read("supabase/migrations/20260819214033_create_investment_decisions.sql");
const portfolios = read("supabase/migrations/20260817174909_initial_phase_1_schema.sql");
const watchlist = read("supabase/migrations/20260922100000_ag_research_watchlist.sql");

test("AG RPC draft relies on existing portfolio, era and cycle fields", () => {
  for (const column of ["is_real_money", "type"]) assert.match(portfolios, new RegExp("\\b" + column + "\\b"));
  for (const column of ["strategy_key", "execution_mode", "ended_at", "inception_at"]) assert.match(eras, new RegExp("\\b" + column + "\\b"));
  for (const column of ["cycle_date", "strategy_era_id", "status"]) assert.match(cycles, new RegExp("\\b" + column + "\\b"));
  assert.match(rpc, /newer_cycle\.cycle_date > v_cycle\.cycle_date/);
});

test("AG decision and watchlist schema dependencies exist", () => {
  for (const column of ["confidence_score", "expected_holding_period", "reassessment_conditions", "exit_conditions", "source", "status"]) {
    assert.match(decisions, new RegExp("\\b" + column + "\\b"));
  }
  for (const column of ["resolved_at", "strategy_era_id", "research_status"]) {
    assert.match(watchlist, new RegExp("\\b" + column + "\\b"));
  }
});

test("AG notes mismatch remains an explicit live-schema release blocker", () => {
  const review = read("docs/ag-schema-compatibility-review.md");
  const fixture = read("tests/ag-postgres-fixture.sql");
  assert.match(rpc, /recommended_quantity,recommended_allocation,notes,/);
  assert.doesNotMatch(decisions, /notes\\s+(?:text|varchar|character varying)/);
  assert.ok(review.includes('live catalog query'));
  assert.match(fixture, /notes text/);
});
