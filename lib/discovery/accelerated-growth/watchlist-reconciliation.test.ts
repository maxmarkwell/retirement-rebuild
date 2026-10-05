import test from "node:test";
import assert from "node:assert/strict";
import {prepareAgWatchPostconditionArgs,reconcileAgWatchlistIntent,verifyAgWatchlistAfterAmbiguousWrite} from "./watchlist-reconciliation";
import type {AgWatchIntent} from "./watchlist-intent-capture";
const cycleId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rowId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const hash="a".repeat(64);
const intent:AgWatchIntent={stream:"research_watch",symbol:"WATCH",source_row_id:rowId,
  action:"resolve_quantitative",resolution:"REJECT"};
const committee:AgWatchIntent={stream:"committee_watch",symbol:"WATCH",source_row_id:rowId,
  action:"supersede_committee",resolution:"REVIEW"};
const row=(i:AgWatchIntent)=>({
  cycle_id:cycleId,stream:i.stream,symbol:i.symbol,action:i.action,
  source_row_id:i.source_row_id,payload_hash:hash,status:"committed" as const,
  effect:"applied" as const,affected_row_id:rowId,
});
test("exact ledger shape is preliminary evidence pending database postconditions",()=>{
  const result=reconcileAgWatchlistIntent({cycleId,intents:[intent,committee],
    ledger:[row(intent),row(committee)]});
  assert.equal(result.status,"RECORDED_REQUIRES_DB_POSTCONDITIONS");
  assert.deepEqual(result.recorded,["research_watch:WATCH","committee_watch:WATCH"]);
});
test("missing, pending, altered, unscoped and duplicate ledger rows require manual reconciliation",()=>{
  const good=row(intent);
  for(const ledger of [
    [],[{...good,status:"pending" as const}],
    [{...good,payload_hash:"bad"}],
    [{...good,cycle_id:rowId}],
    [{...good,source_row_id:null}],
    [{...good,affected_row_id:null}],
    [{...good,effect:"noop" as const,affected_row_id:rowId}],
    [good,good],
    [good,row(committee)],
  ]){
    const result=reconcileAgWatchlistIntent({cycleId,intents:[intent],ledger});
    assert.equal(result.status,"REQUIRES_MANUAL_RECONCILIATION");
  }
});
test("same ticker in distinct watch streams has distinct operation identity",()=>{
  const result=reconcileAgWatchlistIntent({cycleId,intents:[intent,committee],
    ledger:[row(intent)]});
  assert.deepEqual(result.missing,["committee_watch:WATCH"]);
});
test("duplicate frozen operation identities are rejected",()=>{
  assert.throws(()=>reconcileAgWatchlistIntent({cycleId,
    intents:[intent,intent],ledger:[]}));
});
test("committed no-op is explicit and carries no affected row identity",()=>{
  const noSource:AgWatchIntent={stream:"research_watch",symbol:"NEW",source_row_id:null,
    action:"resolve_research",resolution:"STOP"};
  const result=reconcileAgWatchlistIntent({cycleId,intents:[noSource],ledger:[{
    ...row(noSource),source_row_id:null,effect:"noop",affected_row_id:null,
  }]});
  assert.equal(result.status,"RECORDED_REQUIRES_DB_POSTCONDITIONS");
});
test("timeout recovery completes only after every database postcondition verifies",async()=>{
  const input={cycleId,intents:[intent,committee],ledger:[row(intent),row(committee)]};
  const seen:string[]=[];
  assert.equal(await verifyAgWatchlistAfterAmbiguousWrite(input,async(_cycle,item)=>{
    seen.push(item.stream+":"+item.symbol); return true;
  }),"COMPLETE");
  assert.deepEqual(seen,["research_watch:WATCH","committee_watch:WATCH"]);
  assert.equal(await verifyAgWatchlistAfterAmbiguousWrite(input,async(_cycle,item)=>
    item.stream!=="committee_watch"),"MANUAL_RECONCILIATION");
  assert.equal(await verifyAgWatchlistAfterAmbiguousWrite(input,async()=>{throw new Error("read failed")}),
    "MANUAL_RECONCILIATION");
});
test("bad preliminary ledger evidence never invokes the postcondition verifier",async()=>{
  let invoked=false;
  const result=await verifyAgWatchlistAfterAmbiguousWrite(
    {cycleId,intents:[intent],ledger:[]},async()=>{invoked=true;return true;});
  assert.equal(result,"MANUAL_RECONCILIATION");
  assert.equal(invoked,false);
});
test("clean empty plan needs no database mutations",async()=>{
  const input={cycleId,intents:[] as AgWatchIntent[],ledger:[]};
  assert.equal(reconcileAgWatchlistIntent(input).status,"RECORDED_REQUIRES_DB_POSTCONDITIONS");
  assert.equal(await verifyAgWatchlistAfterAmbiguousWrite(input,async()=>false),"COMPLETE");
});

test("postcondition args are derived only from frozen operation content",()=>{
  assert.deepEqual(prepareAgWatchPostconditionArgs(cycleId,intent),{
    p_cycle_id:cycleId,p_stream:"research_watch",p_ticker:"WATCH",
    p_action:"resolve_quantitative",p_source_row_id:rowId,p_resolution:"REJECT",
    p_company_name:null,p_confidence:null,p_thesis:null,p_unresolved_questions:null,
    p_thesis_clock:null,p_invalidation:null,p_model:null,p_prompt_version:null,
    p_prior_watch_reassessed:false,
  });
  const outcome={
    symbol:"NEW",companyName:"New Co",researchStatus:"WATCH" as const,
    confidence:0.72,thesis:"Frozen thesis",unresolvedQuestions:["Q"],
    thesisClock:"medium",invalidation:["I"],model:"model",promptVersion:"v1",
    priorWatchReassessed:false,priorWatchRowId:null,
  };
  const upsert:AgWatchIntent={stream:"research_watch",symbol:"NEW",source_row_id:null,
    action:"upsert_watch",outcome};
  const args=prepareAgWatchPostconditionArgs(cycleId,upsert);
  assert.equal(args.p_thesis,"Frozen thesis");
  assert.deepEqual(args.p_unresolved_questions,["Q"]);
  outcome.unresolvedQuestions.push("later mutation");
  assert.deepEqual(args.p_unresolved_questions,["Q"]);
});
