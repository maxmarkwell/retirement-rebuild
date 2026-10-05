import test from "node:test";
import assert from "node:assert/strict";
import { buildAgDeepResearchCheckpointPayload } from "./stage-payload-builders";

const cycleId="44444444-4444-4444-8444-444444444444";
test("deep-research checkpoint preserves reassessed watch row identity",()=>{
 const prior="55555555-5555-4555-8555-555555555555";
 const result:any={
  upstream:{
   discovery:{universeCount:1,preselectedCount:1,evaluatedCount:1,advanceCount:1,rateLimited:false,stoppedEarly:false},
   catalystSupportedCount:1,deepResearchCompletedCount:1,deepResearchFailedCount:0,proceedCount:0,
   deepResearchOutcomes:[{symbol:"WATCH",companyName:"Example",researchStatus:"WATCH",confidence:.7,
    thesis:"thesis",unresolvedQuestions:["q"],thesisClock:"medium",invalidation:["i"],
    model:"m",promptVersion:"v",priorWatchReassessed:true,priorWatchRowId:prior}],
   quantitativeWatchResolutions:[],committeeWatchResolutions:[],
  },
  eligibleSymbols:[],requestedCount:0,completedCount:0,failedCount:0,decisions:[],errors:[],
 };
 const payload=buildAgDeepResearchCheckpointPayload({cycleId,result});
 assert.equal(payload.watchlist_intent_count,1);
 assert.equal(payload.watchlist_intents[0].source_row_id,prior);
 assert.equal(payload.watchlist_intents[0].action,"upsert_watch");
});
test("deep-research checkpoint fails closed on upstream failure",()=>{
 const result:any={upstream:{discovery:{rateLimited:false,stoppedEarly:false},
  deepResearchOutcomes:[],quantitativeWatchResolutions:[],committeeWatchResolutions:[]},
  errors:[{symbol:"UPSTREAM",stage:"UPSTREAM",error:"failed"}]};
 assert.throws(()=>buildAgDeepResearchCheckpointPayload({cycleId,result}));
});
