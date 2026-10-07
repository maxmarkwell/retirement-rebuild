import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
const source=fs.readFileSync(new URL("../lib/discovery/accelerated-growth/daily-cycle-status.ts",import.meta.url),"utf8");
test("terminal AG cycles cannot remain manual-recovery blockers",()=>{
 assert.match(source,/checkpointNeedsReview = authoritativeCycle\.status === "running"/);
 assert.match(source,/requiresManualRecoveryReview: authoritativeCycle\?\.status === "running"/);
});
