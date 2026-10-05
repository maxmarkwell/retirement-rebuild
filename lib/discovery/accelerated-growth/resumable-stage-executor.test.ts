import test from "node:test";
import assert from "node:assert/strict";
import {executeAgClaimedStage} from "./resumable-stage-executor";
const cycleId="11111111-1111-4111-8111-111111111111";
const checkpointId="22222222-2222-4222-8222-222222222222";
const claimToken="33333333-3333-4333-8333-333333333333";
const fixed="2026-10-05T16:00:00.000Z";
function harness(){
 const events:string[]=[];let submitted:any;
 return {events,get submitted(){return submitted},rpc:{
  async claim(){events.push("claim");return {checkpointId,claimToken,stage:"holding_review" as const}},
  async complete(_c:string,_t:string,o:any){events.push("complete");submitted=o},
 }};
}
test("claims before work and completes immutable evidence afterward",async()=>{
 const h=harness();const source={items:["A"]};
 const out=await executeAgClaimedStage({cycleId,stage:"holding_review",rpc:h.rpc,
  completedAt:()=>fixed,run:async claim=>{h.events.push("work");assert.equal(claim.claimToken,claimToken);
   return {payload:source,result:7};}});
 source.items[0]="MUTATED";
 assert.deepEqual(h.events,["claim","work","complete"]);
 assert.deepEqual(h.submitted.payload,{items:["A"]});
 assert.equal(out.result,7);
});
test("failed work never completes checkpoint",async()=>{
 const h=harness();
 await assert.rejects(()=>executeAgClaimedStage({cycleId,stage:"holding_review",rpc:h.rpc,
  run:async()=>{h.events.push("work");throw new Error("research failed")}}),/research failed/);
 assert.deepEqual(h.events,["claim","work"]);
});
test("invalid claim never runs work",async()=>{
 const h=harness();h.rpc.claim=async()=>({checkpointId:"bad",claimToken,stage:"holding_review"});
 let ran=false;
 await assert.rejects(()=>executeAgClaimedStage({cycleId,stage:"holding_review",rpc:h.rpc as any,
  run:async()=>{ran=true;return {payload:{},result:null}}}),/Invalid AG stage claim/);
 assert.equal(ran,false);
});
