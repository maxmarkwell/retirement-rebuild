import test from "node:test";import assert from "node:assert/strict";
import {deriveAgPostDiscoveryPlan} from "./post-discovery-plan";
const candidate=(symbol:string,status:string,total:number):any=>({symbol,score:{status,total}});
const watch=(rowId:string,lastSeenAt:string):any=>({rowId,confidence:.5,thesis:"t",unresolvedQuestions:["q"],thesisClock:"x",firstSeenAt:lastSeenAt,lastSeenAt});
test("prior watches are selected first and preserve source identities",()=>{
 const h:any={discovery:{candidates:[candidate("NEW","ADVANCE",99),candidate("OLD","ADVANCE",50),candidate("DROP","REJECT",10)]},
  watchContext:{research:{OLD:watch("11111111-1111-4111-8111-111111111111","2026-01-01T00:00:00Z"),
    DROP:watch("22222222-2222-4222-8222-222222222222","2026-01-02T00:00:00Z")},committee:{}}};
 const p=deriveAgPostDiscoveryPlan(h,2);
 assert.deepEqual(p.selected.map(x=>x.symbol),["OLD","NEW"]);
 assert.equal(p.quantitativeWatchResolutions[0].sourceWatchId,"22222222-2222-4222-8222-222222222222");
});
test("Committee watch resolution retains original decision id",()=>{
 const h:any={discovery:{candidates:[candidate("CW","REVIEW",1)]},watchContext:{research:{},committee:{CW:"33333333-3333-4333-8333-333333333333"}}};
 assert.equal(deriveAgPostDiscoveryPlan(h).committeeWatchResolutions[0].sourceDecisionId,"33333333-3333-4333-8333-333333333333");
});
