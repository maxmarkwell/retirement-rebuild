import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
const sql = readFileSync("supabase/migrations/20261027170000_contribution_idempotency.sql", "utf8");
assert.match(sql, /ADD COLUMN IF NOT EXISTS idempotency_key text/);
assert.match(sql, /CREATE UNIQUE INDEX IF NOT EXISTS contributions_user_idempotency_key_uidx/);
assert.match(sql, /ON public\.contributions \(user_id, idempotency_key\)/);
assert.match(sql, /WHERE idempotency_key IS NOT NULL/);
assert.doesNotMatch(sql, /\b(DROP TABLE|TRUNCATE|DELETE FROM|UPDATE public\.contributions|SECURITY DEFINER)\b/i);
console.log("Contribution idempotency migration review checks passed");
