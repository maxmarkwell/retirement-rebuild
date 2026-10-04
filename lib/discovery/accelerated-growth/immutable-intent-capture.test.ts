import test from "node:test";
import assert from "node:assert/strict";
import { captureAgCommitteeIntent, captureAgHoldingIntent, validateAgCombinedIntent } from "./immutable-intent-capture";

const cycleId="44444444-4444-4444-8444-444444444444";
const claimToken="55555555-5555-4555-8555-555555555555";
const common={
  symbol:"TEST",ownershipThesis:"Evidence-based thesis",confidence:78,
  thesisClock:"next two quarters",strongestEvidence:["Demand growth"],
  strongestCounterEvidence:["Competition"],requiredMonitoring:["Margins"],
  invalidation:["Margin collapse"],model:"test-model",promptVersion:"v1",
};
const committee={...common,companyName:"Test",decision:"BUY" as const,
  committeeRationale:"Ownership merit established"};
const holding={...common,decision:"HOLD" as const,rationale:"Thesis remains intact"};
const evidence={TEST:{liquidityEligible:true,evidenceVersion:"v1",themeKey:"software"}};
const captureCommittee=(override={})=>captureAgCommitteeIntent({
  cycleId,claimToken,eligibleSymbols:["TEST"],decisions:[committee],
  failedCount:0,evidenceByTicker:evidence,...override,
});
test("Committee snapshot preserves original decision and exact canonical typed arguments",()=>{
  const result=captureCommittee();
  assert.deepEqual(result.persistence_tickers,["TEST"]);
  assert.deepEqual(result.source_decisions,[committee]);
  assert.deepEqual(result.decision_payloads[0].args,[
    cycleId,"TEST","committee","buy",committee.ownershipThesis,78,
    committee.thesisClock,"Demand growth","Competition","Margins",
    "Margin collapse",null,true,true,"v1","software",
  ]);
  assert.equal(result.calls[0].p_claim_token,claimToken);
});
test("Committee capture rejects incomplete, unexpected, duplicate and failed results",()=>{
  assert.throws(()=>captureCommittee({eligibleSymbols:["TEST","OTHER"]}));
  assert.throws(()=>captureCommittee({eligibleSymbols:["OTHER"]}));
  assert.throws(()=>captureCommittee({decisions:[committee,committee]}));
  assert.throws(()=>captureCommittee({failedCount:1}));
  assert.throws(()=>captureCommittee({evidenceByTicker:{}}));
  assert.throws(()=>captureCommittee({decisions:[{...committee,ownershipThesis:""}]}));
});
test("Holding snapshot preserves legacy notes provenance and nullable evidence",()=>{
  const result=captureAgHoldingIntent({
    cycleId,claimToken,eligibleSymbols:["TEST"],decisions:[holding],failedCount:0,
  });
  assert.deepEqual(result.persistence_tickers,["TEST"]);
  assert.deepEqual(result.source_decisions,[holding]);
  assert.deepEqual(result.decision_payloads[0].args,[
    cycleId,"TEST","holding_review","hold",holding.ownershipThesis,78,
    holding.thesisClock,"Demand growth","Competition","Margins",
    "Margin collapse",JSON.stringify({agHoldingReview:true,
      rationale:holding.rationale,model:holding.model,promptVersion:holding.promptVersion}),
    null,null,null,null,
  ]);
});
test("Holding capture rejects incomplete source sets and malformed decisions",()=>{
  const base={cycleId,claimToken,eligibleSymbols:["TEST"],
    decisions:[holding],failedCount:0};
  assert.throws(()=>captureAgHoldingIntent({...base,eligibleSymbols:[]}));
  assert.throws(()=>captureAgHoldingIntent({...base,failedCount:1}));
  assert.throws(()=>captureAgHoldingIntent({...base,decisions:[{...holding,confidence:Infinity}]}));
});
test("Empty stages are represented explicitly, never by a fabricated ticker",()=>{
  const result=captureAgHoldingIntent({
    cycleId,claimToken,eligibleSymbols:[],decisions:[],failedCount:0,
  });
  assert.deepEqual(result.persistence_tickers,[]);
  assert.equal(result.source_count,0);
});

test("Combined preflight rejects duplicate tickers across Committee and holding",()=>{
  const committeeManifest=captureCommittee();
  const holdingManifest=captureAgHoldingIntent({
    cycleId,claimToken,eligibleSymbols:["TEST"],decisions:[holding],failedCount:0,
  });
  assert.throws(()=>validateAgCombinedIntent(committeeManifest,holdingManifest));
});
test("Combined preflight accepts disjoint source-verified manifests",()=>{
  const committeeManifest=captureCommittee();
  const holdingDecision={...holding,symbol:"HOLDING"};
  const holdingManifest=captureAgHoldingIntent({
    cycleId,claimToken,eligibleSymbols:["HOLDING"],
    decisions:[holdingDecision],failedCount:0,
  });
  assert.deepEqual(validateAgCombinedIntent(committeeManifest,holdingManifest),{
    cycleId,tickers:["HOLDING","TEST"],
  });
  const otherCycle=captureAgHoldingIntent({
    cycleId:"aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",claimToken,
    eligibleSymbols:["HOLDING"],decisions:[holdingDecision],failedCount:0,
  });
  assert.throws(()=>validateAgCombinedIntent(committeeManifest,otherCycle));
});
