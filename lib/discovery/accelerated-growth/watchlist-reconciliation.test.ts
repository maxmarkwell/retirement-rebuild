import test from "node:test";
import assert from "node:assert/strict";
import {canonicalAgWatchOperation,reconcileAgWatchlistIntent} from "./watchlist-reconciliation";
import type {AgWatchIntent} from "./watchlist-intent-capture";
const cycleId="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const rowId="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const intent:AgWatchIntent={stream:"research_watch",symbol:"WATCH",source_row_id:rowId,
  action:"resolve_quantitative",resolution:"REJECT"};
const committee:AgWatchIntent={stream:"committee_watch",symbol:"WATCH",source_row_id:rowId,
  action:"supersede_committee",resolution:"REVIEW"};
const row=(i:AgWatchIntent)=>({
  cycle_id:cycleId,stream:i.stream,symbol:i.symbol,action:i.action,
  payload_json:canonicalAgWatchOperation(i),status:"committed" as const,
  affected_row_id:rowId,
});
test("exact frozen operations are recorded, but database postconditions remain mandatory",()=>{
  const result=reconcileAgWatchlistIntent({cycleId,intents:[intent,committee],
    ledger:[row(intent),row(committee)]});
  assert.equal(result.status,"VERIFIED_RECORDED_REQUIRES_DB_POSTCONDITIONS");
  assert.deepEqual(result.recorded,["research_watch:WATCH","committee_watch:WATCH"]);
});
test("missing, pending, altered, unscoped and duplicate ledger rows require manual reconciliation",()=>{
  const good=row(intent);
  for(const ledger of [
    [],[{...good,status:"pending" as const}],
    [{...good,payload_json:"{}"}],
    [{...good,cycle_id:rowId}],
    [{...good,affected_row_id:null}],
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
test("payload identity includes action and resolution and rejects duplicate intents",()=>{
  const altered:AgWatchIntent={stream:"research_watch",symbol:"WATCH",source_row_id:rowId,
    action:"resolve_quantitative",resolution:"REVIEW"};
  assert.notEqual(canonicalAgWatchOperation(intent),canonicalAgWatchOperation(altered));
  assert.throws(()=>reconcileAgWatchlistIntent({cycleId,
    intents:[intent,intent],ledger:[]}));
});
test("clean empty plan with no ledger entries has no unresolved mutations",()=>{
  const result=reconcileAgWatchlistIntent({cycleId,intents:[],ledger:[]});
  assert.equal(result.status,"VERIFIED_RECORDED_REQUIRES_DB_POSTCONDITIONS");
  assert.deepEqual(result.recorded,[]);
});
