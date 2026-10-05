import test from "node:test";
import assert from "node:assert/strict";
import {aggregateAgCommitteeSymbolOutputs} from "./symbol-stage-aggregation";

const decision=(symbol:string)=>({symbol,companyName:null,decision:"WATCH" as const,ownershipThesis:"x",committeeRationale:"x",strongestEvidence:["x"],strongestCounterEvidence:["x"],requiredMonitoring:["x"],thesisClock:"x",invalidation:["x"],confidence:.5,model:"m",promptVersion:"v"});
test("Committee symbol aggregation is deterministic",()=>{
 const out=aggregateAgCommitteeSymbolOutputs({eligibleSymbols:["AAA","BBB"],decisions:[decision("BBB"),decision("AAA")]});
 assert.deepEqual(out.decisions.map(x=>x.symbol),["AAA","BBB"]);
});
test("Committee aggregation rejects missing, duplicate and extra identities",()=>{
 assert.throws(()=>aggregateAgCommitteeSymbolOutputs({eligibleSymbols:["AAA","BBB"],decisions:[decision("AAA")]}));
 assert.throws(()=>aggregateAgCommitteeSymbolOutputs({eligibleSymbols:["AAA"],decisions:[decision("AAA"),decision("AAA")]}));
 assert.throws(()=>aggregateAgCommitteeSymbolOutputs({eligibleSymbols:["AAA"],decisions:[decision("AAA"),decision("BBB")]}));
});