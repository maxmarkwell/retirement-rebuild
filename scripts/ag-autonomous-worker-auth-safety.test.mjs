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
});

test("browser minting is paper-only and worker claiming is service-role-only",async()=>{
 const sql=await readFile("supabase/migration-candidates/20261006_ag_autonomous_worker_authorization_review_candidate.sql","utf8");
 assert.match(sql,/ag_authorize_cycle_worker/);
 assert.match(sql,/auth\.uid\(\)/);
 assert.match(sql,/p\.is_real_money=false/);
 assert.match(sql,/e\.execution_mode='paper'/);
 assert.match(sql,/c\.status='running'/);
 assert.match(sql,/token_hash.*\^\[0-9a-f\]\{64\}\$/s);
 assert.match(sql,/Active worker authorization already exists/);
 assert.match(sql,/ag_claim_cycle_worker/);
 assert.match(sql,/for update/);
 assert.match(sql,/invocation_count >= v_auth\.max_invocations/);
 assert.match(sql,/revoke all on function public\.ag_claim_cycle_worker\(uuid,text\) from public, anon, authenticated/);
 assert.match(sql,/grant execute on function public\.ag_claim_cycle_worker\(uuid,text\) to service_role/);
 assert.match(sql,/ag_finish_cycle_worker/);
 assert.match(sql,/p_terminal_status not in \('consumed','revoked'\)/);
});
