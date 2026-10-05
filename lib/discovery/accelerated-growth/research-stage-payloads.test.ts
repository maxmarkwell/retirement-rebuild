import test from "node:test";import assert from "node:assert/strict";
import {parseAgDiscoveryStagePayload,parseAgDeepResearchResults} from "./research-stage-payloads";

const uuid="11111111-1111-4111-8111-111111111111";
test("Discovery checkpoint parser revalidates frozen handoff",()=>{
 const payload:any={discovery:{rateLimited:false,stoppedEarly:false,errors:[],candidates:[]},
  watch_context:{research:{ABC:{rowId:uuid,confidence:.5,thesis:"t",unresolvedQuestions:[],thesisClock:"short",firstSeenAt:"2026-01-01",lastSeenAt:"2026-01-02"}},committee:{}}};
 assert.equal(parseAgDiscoveryStagePayload(payload).watchContext.research.ABC.rowId,uuid);
 payload.watch_context.research.ABC.rowId="not-a-uuid";
 assert.throws(()=>parseAgDiscoveryStagePayload(payload),/prior research watch/);
});
test("deep research checkpoint parser rejects duplicate or incomplete provenance",()=>{
 const row:any={symbol:"ABC",researchStatus:"PROCEED",confidence:.8,thesis:"thesis",model:"model",promptVersion:"v1"};
 assert.equal(parseAgDeepResearchResults({deep_research_results:[row]})[0].symbol,"ABC");
 assert.throws(()=>parseAgDeepResearchResults({deep_research_results:[row,{...row}]}),/Invalid AG deep research/);
 assert.throws(()=>parseAgDeepResearchResults({deep_research_results:[{...row,promptVersion:""}]}),/Invalid AG deep research/);
});
