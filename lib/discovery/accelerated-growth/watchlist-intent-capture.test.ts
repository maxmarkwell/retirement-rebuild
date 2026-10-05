import assert from "node:assert/strict";
import test from "node:test";
import {captureAgWatchlistIntent} from "./watchlist-intent-capture";
const cycleId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const watchId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const committeeId="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const watch={
  symbol:"WATCH",companyName:"Example",researchStatus:"WATCH" as const,
  confidence:0.71,thesis:"Watch thesis",unresolvedQuestions:["Question"],
  thesisClock:"medium",invalidation:["Invalidation"],model:"model",
  promptVersion:"v1",priorWatchReassessed:false,priorWatchRowId:null,
};
const base=()=>({
  cycleId,outcomes:[watch],quantitativeResolutions:[{symbol:"OLD",sourceWatchId:watchId,resolution:"REJECT" as const}],
  committeeResolutions:[{symbol:"COMMITTEE",sourceDecisionId:committeeId,resolution:"REVIEW" as const}],
  upstreamErrors:[],upstreamFailedCount:0,
  discoveryRateLimited:false,discoveryStoppedEarly:false,
});
test("captures all distinct legacy mutation streams without database writes",()=>{
  const source=base();
  const result=captureAgWatchlistIntent(source);
  assert.equal(result.intent_count,3);
  assert.deepEqual(result.intents.map(x=>[x.stream,x.action,x.symbol]),[
    ["research_watch","upsert_watch","WATCH"],
    ["research_watch","resolve_quantitative","OLD"],
    ["committee_watch","supersede_committee","COMMITTEE"],
  ]);
  source.outcomes[0].unresolvedQuestions[0]="Mutated";
  assert.deepEqual(result.intents[0].action==="upsert_watch" &&
    result.intents[0].outcome.unresolvedQuestions,["Question"]);
});
test("explicit empty watchlist intent is valid for a clean research result",()=>{
  assert.deepEqual(captureAgWatchlistIntent({...base(),outcomes:[],
    quantitativeResolutions:[],committeeResolutions:[]}),{
    cycle_id:cycleId,intent_count:0,intents:[],
  });
});
test("research PROCEED/STOP produce conditional resolution intent",()=>{
  const result=captureAgWatchlistIntent({...base(),
    outcomes:[{...watch,researchStatus:"PROCEED"},
      {...watch,symbol:"STOP",researchStatus:"STOP"}],
    quantitativeResolutions:[],committeeResolutions:[]});
  assert.deepEqual(result.intents.map(x=>x.action),[
    "resolve_research","resolve_research"]);
});
test("fails closed for partial research, duplicates and conflicting streams",()=>{
  for(const patch of [
    {upstreamErrors:[{stage:"DISCOVERY"}]},
    {upstreamFailedCount:1},
    {discoveryRateLimited:true},
    {discoveryStoppedEarly:true},
    {outcomes:[watch,watch]},
    {quantitativeResolutions:[{symbol:"WATCH",sourceWatchId:watchId,resolution:"REJECT"}]},
    {committeeResolutions:[{symbol:"COMMITTEE",sourceDecisionId:committeeId,resolution:"REVIEW"},
      {symbol:"COMMITTEE",sourceDecisionId:committeeId,resolution:"REJECT"}]},
    {outcomes:[{...watch,symbol:"lowercase"}]},
    {outcomes:[{...watch,confidence:71}]},
    {outcomes:[{...watch,priorWatchReassessed:true,priorWatchRowId:null}]},
    {quantitativeResolutions:[{symbol:"OLD",sourceWatchId:"not-a-uuid",resolution:"REJECT"}]},
  ]) assert.throws(()=>captureAgWatchlistIntent({...base(),...patch} as never));
});
test("same ticker across distinct research and Committee watch tables remains separate",()=>{
  const result=captureAgWatchlistIntent({...base(),
    committeeResolutions:[{symbol:"WATCH",sourceDecisionId:committeeId,resolution:"REVIEW"}]});
  assert.equal(result.intents.filter(x=>x.symbol==="WATCH").length,2);
});
