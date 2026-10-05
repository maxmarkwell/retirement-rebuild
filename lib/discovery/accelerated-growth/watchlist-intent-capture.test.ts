import assert from "node:assert/strict";
import test from "node:test";
import {captureAgWatchlistIntent} from "./watchlist-intent-capture";
const cycleId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const watch={
  symbol:"WATCH",companyName:"Example",researchStatus:"WATCH" as const,
  confidence:71,thesis:"Watch thesis",unresolvedQuestions:["Question"],
  thesisClock:"medium",invalidation:["Invalidation"],model:"model",
  promptVersion:"v1",priorWatchReassessed:false,
};
const base=()=>({
  cycleId,outcomes:[watch],quantitativeResolutions:[{symbol:"OLD",resolution:"REJECT" as const}],
  committeeResolutions:[{symbol:"COMMITTEE",resolution:"REVIEW" as const}],
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
    {quantitativeResolutions:[{symbol:"WATCH",resolution:"REJECT"}]},
    {committeeResolutions:[{symbol:"COMMITTEE",resolution:"REVIEW"},
      {symbol:"COMMITTEE",resolution:"REJECT"}]},
    {outcomes:[{...watch,symbol:"lowercase"}]},
  ]) assert.throws(()=>captureAgWatchlistIntent({...base(),...patch} as never));
});
test("same ticker across distinct research and Committee watch tables remains separate",()=>{
  const result=captureAgWatchlistIntent({...base(),
    committeeResolutions:[{symbol:"WATCH",resolution:"REVIEW"}]});
  assert.equal(result.intents.filter(x=>x.symbol==="WATCH").length,2);
});
