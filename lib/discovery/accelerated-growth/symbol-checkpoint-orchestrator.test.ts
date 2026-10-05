import test from "node:test";import assert from "node:assert/strict";
import {inspectAgSymbolManifest,runNextAgSymbolWork,type AgSymbolCheckpointRow} from "./symbol-checkpoint-orchestrator";
const done=(symbol:string):AgSymbolCheckpointRow=>({symbol,status:"completed",output:{symbol,value:symbol}});
test("resume selects exactly one missing symbol and preserves completed work",async()=>{
 const rows:AgSymbolCheckpointRow[]=[done("AAA")];let claimed:string[]=[];
 const io={read:async()=>rows,claim:async(_c:string,_p:any,s:string)=>{claimed.push(s);return{checkpointId:"id",claimToken:"token"}},complete:async()=>true};
 const r=await runNextAgSymbolWork({cycleId:"c",parentStage:"committee",expectedSymbols:["AAA","BBB","CCC"],io,work:async symbol=>({symbol})});
 assert.deepEqual(r,{action:"SYMBOL_COMPLETED",symbol:"BBB"});assert.deepEqual(claimed,["BBB"]);
});
test("complete manifest aggregates in expected order",()=>{
 const r=inspectAgSymbolManifest(["AAA","BBB"],[done("BBB"),done("AAA")]);
 assert.equal(r.action,"AGGREGATE");if(r.action==="AGGREGATE")assert.deepEqual(r.outputs.map((x:any)=>x.symbol),["AAA","BBB"]);
});
test("running failed manual duplicate extra or malformed completed state fails closed",()=>{
 for(const status of ["running","failed","needs_manual_review"] as const)
  assert.equal(inspectAgSymbolManifest(["AAA"],[{symbol:"AAA",status,output:null}]).action,"MANUAL_RECONCILIATION");
 assert.equal(inspectAgSymbolManifest(["AAA"],[done("AAA"),done("AAA")]).action,"MANUAL_RECONCILIATION");
 assert.equal(inspectAgSymbolManifest(["AAA"],[done("BBB")]).action,"MANUAL_RECONCILIATION");
 assert.equal(inspectAgSymbolManifest(["AAA"],[{symbol:"AAA",status:"completed",output:{symbol:"BBB"}}]).action,"MANUAL_RECONCILIATION");
});
test("rejected completion never retries or advances",async()=>{
 let completeCalls=0;
 const io={read:async()=>[],claim:async()=>({checkpointId:"id",claimToken:"token"}),complete:async()=>{completeCalls++;return false}};
 await assert.rejects(()=>runNextAgSymbolWork({cycleId:"c",parentStage:"committee",expectedSymbols:["AAA"],io,work:async()=>({symbol:"AAA"})}),/reconcile durable state/);
 assert.equal(completeCalls,1);
});