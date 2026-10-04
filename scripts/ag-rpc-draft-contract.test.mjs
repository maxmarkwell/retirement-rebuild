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
