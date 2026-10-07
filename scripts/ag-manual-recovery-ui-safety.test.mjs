import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const route=fs.readFileSync(new URL("../app/api/accelerated-growth/daily-cycle/recover/route.ts",import.meta.url),"utf8");
const ui=fs.readFileSync(new URL("../components/ag-daily-cycle-control.tsx",import.meta.url),"utf8");
test("AG recovery endpoint requires authenticated browser ownership path",()=>{
 assert.match(route,/auth\.getUser\(\)/);
 assert.match(route,/Authentication required/);
 assert.match(route,/ag_recover_cycle_to_failed/);
 assert.match(route,/executionEnabled: false/);
 assert.match(route,/transactionsWritten: false/);
});
test("AG UI exposes recovery only for manual-review state",()=>{
 assert.match(ui,/requiresManualRecoveryReview/);
 assert.match(ui,/recoverCycle/);
 assert.match(ui,/Mark Failed &amp; Unblock/);
 assert.match(ui,/daily-cycle\/recover/);
});
