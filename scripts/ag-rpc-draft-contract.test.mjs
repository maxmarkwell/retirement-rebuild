import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const sql = readFileSync("docs/ag-atomic-decision-rpc-draft.sql", "utf8");
const normalize = (value) => value.replace(/--[^\n]*/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const declaration = sql.match(/CREATE OR REPLACE FUNCTION public\.ag_commit_cycle_decision\(([\s\S]*?)\)\s*RETURNS uuid/i);
const signature = (body) => body.split(",").map((arg) => arg.trim().split(/\s+/)[0].toLowerCase());

test("draft AG RPC GRANT and REVOKE signatures match its declaration", () => {
  assert.ok(declaration, "RPC declaration must exist");
  const declaredTypes = declaration[1].split(",").map((arg) => {
    const parts = arg.trim().split(/\s+/);
    return parts[1].toLowerCase();
  });
  for (const operation of ["REVOKE", "GRANT"]) {
    const match = sql.match(new RegExp(operation + String.raw`[^;]*?ON FUNCTION public\.ag_commit_cycle_decision\(([^)]*)\)`, "i"));
    assert.ok(match, operation + " signature must exist");
    assert.deepEqual(signature(match[1]), declaredTypes, operation + " signature mismatch");
  }
  assert.match(normalize(sql), /security definer/);
  assert.match(normalize(sql), /set search_path = ''/);
});

test("draft RPC fails closed on null inputs, ownership, claim and ambiguous active decisions", () => {
  const normalized = normalize(sql);
  for (const requirement of [
    "p_kind is null", "p_decision_type is null",
    "user_id = auth.uid()", "p.is_real_money = false",
    "v_checkpoint.claim_token is distinct from p_claim_token",
    "v_checkpoint.lease_expires_at <= now()",
    "if v_existing_count > 1",
    "newer_cycle.cycle_date > v_cycle.cycle_date",
    "raise exception 'conflicting payload for ag cycle ticker'",
  ]) {
    assert.ok(normalized.includes(requirement), "Missing RPC safety check: " + requirement);
  }
});

test("draft RPC ticker regex is complete and SQL string literals are balanced", () => {
  assert.ok(sql.includes("p_ticker !~ '^[A-Z][A-Z0-9.-]{0,14}$'"));
  const body = sql.split("AS $$")[1]?.split("$$;")[0];
  assert.ok(body, "PL/pgSQL function body must exist");
  const withoutComments = body.replace(/--[^\n]*/g, "");
  // Escaped SQL apostrophes are pairs; odd quote count signals a truncated literal.
  assert.equal((withoutComments.match(/'/g) ?? []).length % 2, 0);
});

test("draft RPC never treats a committed ledger with missing decision ID as success", () => {
  const normalized = normalize(sql);
  assert.match(normalized, /if v_ledger\.status = 'committed' then if v_ledger\.investment_decision_id is null then raise exception/);
  assert.match(normalized, /return v_ledger\.investment_decision_id/);
});
