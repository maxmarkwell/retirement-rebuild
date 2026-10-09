import test from "node:test";
import assert from "node:assert/strict";
import {AG_ROUTE_MAX_SECONDS,AG_STAGE_LEASE_SECONDS,AG_STAGE_FINISH_RESERVE_SECONDS,
 AG_STAGE_WORK_BUDGET_SECONDS,AG_MAX_EXPENSIVE_SYMBOLS_PER_STAGE_CLAIM,
 assertAgStageRuntimeContract} from "./stage-runtime-budget";

test("AG work budget fits route and lease with completion reserve",()=>{
 assert.equal(AG_ROUTE_MAX_SECONDS,300);
 assert.equal(AG_STAGE_LEASE_SECONDS,360);
 assert.equal(AG_STAGE_FINISH_RESERVE_SECONDS,45);
 assert.equal(AG_STAGE_WORK_BUDGET_SECONDS,255);
 assert.ok(AG_STAGE_WORK_BUDGET_SECONDS+AG_STAGE_FINISH_RESERVE_SECONDS<=AG_ROUTE_MAX_SECONDS);
 assert.ok(AG_STAGE_WORK_BUDGET_SECONDS+AG_STAGE_FINISH_RESERVE_SECONDS<=AG_STAGE_LEASE_SECONDS);
});
test("one expensive symbol is the maximum durable work unit",()=>{
 assert.equal(AG_MAX_EXPENSIVE_SYMBOLS_PER_STAGE_CLAIM,1);
});
test("invalid or dangerously small runtime budgets fail closed",()=>{
 assert.throws(()=>assertAgStageRuntimeContract({routeMaxSeconds:60,leaseSeconds:60,reserveSeconds:15}));
 assert.throws(()=>assertAgStageRuntimeContract({routeMaxSeconds:300,leaseSeconds:360,reserveSeconds:5}));
});
