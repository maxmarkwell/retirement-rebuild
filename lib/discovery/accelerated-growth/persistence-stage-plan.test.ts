import {describe,it,expect} from "vitest";
import {prepareAgPersistenceDecisionCalls} from "./persistence-stage-plan";
const cycle="11111111-1111-4111-8111-111111111111";
const claim="22222222-2222-4222-8222-222222222222";
const oldClaim="33333333-3333-4333-8333-333333333333";
const frozen=(ticker:string,kind:"holding_review"|"committee",type:string)=>({
 decision_payloads:[{ticker,args:[cycle,ticker,kind,type,"thesis",80,"medium",
  "bull","bear","monitor","invalidate",null,false,true,"v1",null]}],
 calls:[{p_claim_token:oldClaim}],
});
describe("AG persistence stage plan",()=>{
 it("rekeys frozen stage intent under only the persistence claim",()=>{
  const calls=prepareAgPersistenceDecisionCalls({cycleId:cycle,claimToken:claim,
   holding:frozen("HELD","holding_review","hold"),
   committee:frozen("NEW","committee","watch")});
  expect(calls.map(x=>x.p_ticker)).toEqual(["HELD","NEW"]);
  expect(calls.every(x=>x.p_claim_token===claim)).toBe(true);
  expect(calls.some(x=>x.p_claim_token===oldClaim)).toBe(false);
 });
 it("supports an explicit zero-decision cycle",()=>{
  expect(prepareAgPersistenceDecisionCalls({cycleId:cycle,claimToken:claim,
   holding:{decision_payloads:[]},committee:{decision_payloads:[]}})).toEqual([]);
 });
 it("fails closed on overlap or mutated canonical identity",()=>{
  expect(()=>prepareAgPersistenceDecisionCalls({cycleId:cycle,claimToken:claim,
   holding:frozen("SAME","holding_review","hold"),
   committee:frozen("SAME","committee","watch")})).toThrow(/overlap/);
  const bad=frozen("BAD","committee","watch");
  (bad.decision_payloads[0].args as unknown[])[0]="99999999-9999-4999-8999-999999999999";
  expect(()=>prepareAgPersistenceDecisionCalls({cycleId:cycle,claimToken:claim,
   holding:{decision_payloads:[]},committee:bad})).toThrow(/payload/);
 });
});
