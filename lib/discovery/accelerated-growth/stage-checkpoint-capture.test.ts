import test from "node:test";
import assert from "node:assert/strict";
import { captureAgStageCheckpoint } from "./stage-checkpoint-capture";

const cycleId="44444444-4444-4444-8444-444444444444";
const checkpointId="55555555-5555-4555-8555-555555555555";
const claimToken="66666666-6666-4666-8666-666666666666";

test("captures a cloned immutable stage envelope through claim then complete",async()=>{
 const payload={persistence_tickers:["TEST"],source:{model:"original"}};
 let completed:any=null;
 const promise=captureAgStageCheckpoint({
  cycleId,stage:"committee",payload,completedAt:"2026-10-05T15:00:00.000Z",
  rpc:{
   claim:async(cycle,stage)=>{assert.equal(cycle,cycleId);assert.equal(stage,"committee");
    return {checkpointId,claimToken,stage};},
   complete:async(id,token,output)=>{completed={id,token,output};},
  },
 });
 payload.source.model="mutated";
 const result=await promise;
 assert.deepEqual(result,{checkpointId,stage:"committee"});
 assert.equal(completed.id,checkpointId);
 assert.equal(completed.token,claimToken);
 assert.equal(completed.output.payload.source.model,"original");
 assert.deepEqual(completed.output.payload.persistence_tickers,["TEST"]);
});

test("invalid claim response fails before completion",async()=>{
 let completed=false;
 await assert.rejects(()=>captureAgStageCheckpoint({
  cycleId,stage:"holding_review",payload:{persistence_tickers:[]},
  rpc:{
   claim:async()=>({checkpointId,claimToken:"bad",stage:"holding_review"}),
   complete:async()=>{completed=true;},
  },
 }));
 assert.equal(completed,false);
});

test("claim failure never attempts completion",async()=>{
 let completed=false;
 await assert.rejects(()=>captureAgStageCheckpoint({
  cycleId,stage:"committee",payload:{},
  rpc:{
   claim:async()=>{throw new Error("claim rejected");},
   complete:async()=>{completed=true;},
  },
 }));
 assert.equal(completed,false);
});
