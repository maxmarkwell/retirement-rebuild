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
test("three-symbol work progresses across requests without recomputing completed symbols",async()=>{
 const rows:AgSymbolCheckpointRow[]=[];const workCalls:string[]=[];const claimCalls:string[]=[];
 const io={
  read:async()=>structuredClone(rows),
  claim:async(_c:string,_p:any,s:string)=>{claimCalls.push(s);rows.push({symbol:s,status:"running",output:null});return{checkpointId:s,claimToken:"token-"+s}},
  complete:async(id:string,_token:string,output:unknown)=>{const row=rows.find(x=>x.symbol===id)!;row.status="completed";row.output=output;return true},
 };
 const invoke=()=>runNextAgSymbolWork({cycleId:"cycle",parentStage:"committee",expectedSymbols:["AAA","BBB","CCC"],io,work:async symbol=>{workCalls.push(symbol);return{symbol}}});
 assert.deepEqual(await invoke(),{action:"SYMBOL_COMPLETED",symbol:"AAA"});
 assert.deepEqual(await invoke(),{action:"SYMBOL_COMPLETED",symbol:"BBB"});
 // Simulated request interruption: durable rows survive; no in-memory orchestration state is required.
 assert.deepEqual(await invoke(),{action:"SYMBOL_COMPLETED",symbol:"CCC"});
 const final=await invoke();assert.equal(final.action,"AGGREGATE");
 assert.deepEqual(workCalls,["AAA","BBB","CCC"]);assert.deepEqual(claimCalls,["AAA","BBB","CCC"]);
 if(final.action==="AGGREGATE")assert.deepEqual(final.outputs.map((x:any)=>x.symbol),["AAA","BBB","CCC"]);
});
