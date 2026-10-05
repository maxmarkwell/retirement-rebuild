import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";

test("AG finalization contract requires completed persistence and verified manifests",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/cycle-finalization-contract.ts","utf8");
 assert.match(source,/PERSISTENCE_NOT_COMPLETE/);
 assert.match(source,/PERSISTENCE_OUTPUT_MISSING/);
 assert.match(source,/DECISION_MANIFEST_NOT_VERIFIED/);
 assert.match(source,/WATCH_MANIFEST_NOT_VERIFIED/);
 assert.match(source,/COMPLETED_CYCLE_POSTCONDITION_MISMATCH/);
 assert.doesNotMatch(source,/createClient|supabase|executeAgDailyCycleTransactions/);
});

test("research-only coordinator cannot finalize the authoritative cycle",async()=>{
 const source=await readFile("lib/discovery/accelerated-growth/resumable-cycle-orchestrator.ts","utf8");
 assert.doesNotMatch(source,/cycle-finalization-contract/);
 assert.doesNotMatch(source,/status:"completed"/);
 assert.doesNotMatch(source,/completed_at/);
});

test("AG finalization candidate is authenticated, CAS-like, and paper-only",async()=>{
 const sql=await readFile("supabase/migration-candidates/20261005_ag_cycle_finalization_review_candidate.sql","utf8");
 assert.match(sql,/security definer/i);
 assert.match(sql,/set search_path = ''/i);
 assert.match(sql,/auth\.uid\(\) is null/i);
 assert.match(sql,/stage='finalized'/);
 assert.match(sql,/lease_expires_at > now\(\)/);
 assert.match(sql,/stage='persistence' and status='completed'/);
 assert.match(sql,/p\.type='paper_active' and p\.is_real_money=false/);
 assert.match(sql,/ag_verify_committee_payload_manifest/);
 assert.match(sql,/ag_verify_holding_payload_manifest/);
 assert.match(sql,/ag_verify_cycle_watch_manifest/);
 assert.match(sql,/where id=v_cycle\.id and user_id=auth\.uid\(\) and status='running'/);
 assert.match(sql,/revoke all on function public\.ag_finalize_daily_cycle\(uuid,uuid\) from public/i);
 assert.match(sql,/revoke all on function public\.ag_finalize_daily_cycle\(uuid,uuid\) from anon/i);
 assert.doesNotMatch(sql,/transactions/i);
});

test("research route cannot import finalization transport",async()=>{
 const route=await readFile("app/api/accelerated-growth/daily-cycle/route.ts","utf8");
 assert.doesNotMatch(route,/cycle-finalization-supabase|ag_finalize_daily_cycle/);
});
