import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const sql=fs.readFileSync(new URL("../supabase/migration-candidates/20261007_ag_manual_cycle_recovery_candidate.sql",import.meta.url),"utf8");
test("AG manual recovery is owner-scoped and evidence-gated",()=>{
 assert.match(sql,/auth\.uid\(\) is null/);
 assert.match(sql,/id=p_cycle_id and user_id=auth\.uid\(\)/);
 assert.match(sql,/c\.status <> 'running'/);
 assert.match(sql,/needs_manual_review/);
 assert.match(sql,/lease_expires_at < now\(\)/);
 assert.match(sql,/status in \('revoked','expired'\)/);
 assert.match(sql,/no manual-recovery evidence/);
});
test("AG manual recovery only terminalizes cycle and running checkpoints",()=>{
 assert.match(sql,/update public\.ag_cycle_stage_checkpoints/);
 assert.match(sql,/where cycle_id=p_cycle_id and status='running'/);
 assert.match(sql,/update public\.ag_daily_cycles/);
 assert.match(sql,/set status='failed'/);
 for(const forbidden of ["investment_decisions","ag_research_watchlist","portfolio_holdings","transactions"]) assert.doesNotMatch(sql,new RegExp("update public\\."+forbidden));
});
test("AG manual recovery is not anonymous",()=>{
 assert.match(sql,/revoke all on function public\.ag_recover_cycle_to_failed\(uuid,text\) from public,anon/);
 assert.match(sql,/grant execute on function public\.ag_recover_cycle_to_failed\(uuid,text\) to authenticated,service_role/);
});
