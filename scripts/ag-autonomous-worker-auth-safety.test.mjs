import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG worker authorization candidate is server-only and bounded",async()=>{
 const sql=await readFile("supabase/migration-candidates/20261006_ag_autonomous_worker_authorization_review_candidate.sql","utf8");
 assert.match(sql,/REVIEW CANDIDATE ONLY/);
 assert.match(sql,/cycle_id uuid not null unique/);
 assert.match(sql,/token_hash text not null unique/);
 assert.match(sql,/status in \('active','consumed','revoked','expired'\)/i);
 assert.match(sql,/max_invocations integer not null default 32/);
 assert.match(sql,/expires_at timestamptz not null/);
 assert.match(sql,/enable row level security/);
 assert.match(sql,/revoke all on table public\.ag_cycle_worker_authorizations from public, anon, authenticated/);
 assert.match(sql,/grant select, insert, update on table public\.ag_cycle_worker_authorizations to service_role/);
 assert.doesNotMatch(sql,/grant .*authenticated/i);
});
