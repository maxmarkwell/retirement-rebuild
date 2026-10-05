import test from "node:test";
import assert from "node:assert/strict";
import {
 AgAmbiguousWatchWriteError,commitPreparedAgWatchBatch,prepareAgWatchRpcBatch,
} from "./watchlist-persistence-adapter";
import type {AgWatchIntent} from "./watchlist-intent-capture";
const cycle="aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const claim="bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const row="cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const id1="dddddddd-dddd-4ddd-8ddd-dddddddddddd";
const id2="eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee";
const intents:AgWatchIntent[]=[
 {stream:"research_watch",symbol:"OLD",source_row_id:row,
  action:"resolve_quantitative",resolution:"REJECT"},
 {stream:"committee_watch",symbol:"COM",source_row_id:row,
  action:"supersede_committee",resolution:"REVIEW"},
];
test("watch RPC batch is derived from frozen intent and persistence claim",()=>{
 const calls=prepareAgWatchRpcBatch(cycle,claim,intents);
 assert.equal(calls[0].p_cycle_id,cycle);
 assert.equal(calls[0].p_claim_token,claim);
 assert.equal(calls[0].p_source_row_id,row);
 assert.equal(calls[0].p_resolution,"REJECT");
 assert.equal(calls[0].p_thesis,null);
});
test("whole watch batch validates before first RPC",async()=>{
 const calls=prepareAgWatchRpcBatch(cycle,claim,intents);
 let invoked=0;
 const forged={...calls[1],p_source_row_id:null};
 await assert.rejects(()=>commitPreparedAgWatchBatch([calls[0],forged],async()=>{invoked++;return id1;}));
 assert.equal(invoked,0);
 const extra={...calls[0],p_payload_hash:"forged"} as typeof calls[number];
 await assert.rejects(()=>commitPreparedAgWatchBatch([extra],async()=>{invoked++;return id1;}));
 assert.equal(invoked,0);
});
test("successful watch batch returns ledger ids in frozen order",async()=>{
 const calls=prepareAgWatchRpcBatch(cycle,claim,intents);
 const ids=[id1,id2];let i=0;
 assert.deepEqual(await commitPreparedAgWatchBatch(calls,async()=>ids[i++]),ids);
});
test("ambiguous watch response stops immediately and preserves acknowledgments",async()=>{
 const calls=prepareAgWatchRpcBatch(cycle,claim,intents);
 let invoked=0;
 try{
  await commitPreparedAgWatchBatch(calls,async()=>{
   invoked++;if(invoked===1)return id1;throw new Error("timeout after possible commit");
  });
  assert.fail("expected ambiguous watch write");
 }catch(error){
  assert.ok(error instanceof AgAmbiguousWatchWriteError);
  assert.equal(error.ticker,"COM");
  assert.deepEqual(error.acknowledged,[{stream:"research_watch",ticker:"OLD",ledgerId:id1}]);
 }
 assert.equal(invoked,2);
});
test("invalid watch RPC result is ambiguous and never retried",async()=>{
 const calls=prepareAgWatchRpcBatch(cycle,claim,[intents[0]]);
 let invoked=0;
 await assert.rejects(()=>commitPreparedAgWatchBatch(calls,async()=>{invoked++;return "not-a-uuid";}),
  AgAmbiguousWatchWriteError);
 assert.equal(invoked,1);
});
test("empty watch batch is an explicit no-write success",async()=>{
 let invoked=0;
 assert.deepEqual(await commitPreparedAgWatchBatch([],async()=>{invoked++;return id1;}),[]);
 assert.equal(invoked,0);
});
