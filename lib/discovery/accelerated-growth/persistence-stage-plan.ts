/** Pure re-keying of frozen decision intent under the persistence-stage claim.
 * Stage claim tokens are never durable authorization and are never reused.
 */
import type {AgRpcCall} from "./atomic-persistence-adapter";
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SYMBOL=/^[A-Z][A-Z0-9.-]{0,14}$/;
type Frozen={ticker:string;args:unknown[]};
function rows(payload:Record<string,unknown>,kind:"holding_review"|"committee",cycleId:string,claimToken:string):AgRpcCall[]{
 if(!payload||!Array.isArray(payload.decision_payloads))throw new Error("Missing frozen AG decision manifest");
 return payload.decision_payloads.map((raw)=>{
  if(!raw||typeof raw!=="object")throw new Error("Invalid frozen AG decision manifest");
  const item=raw as Partial<Frozen>,a=item.args;
  if(typeof item.ticker!=="string"||!SYMBOL.test(item.ticker)||!Array.isArray(a)||a.length!==16||
     a[0]!==cycleId||a[1]!==item.ticker||a[2]!==kind||
     typeof a[3]!=="string"||typeof a[4]!=="string"||typeof a[5]!=="number"||
     typeof a[6]!=="string")throw new Error("Invalid frozen AG decision payload");
  return {p_cycle_id:cycleId,p_claim_token:claimToken,p_ticker:item.ticker,p_kind:kind,
   p_decision_type:a[3],p_thesis:a[4],p_confidence:a[5],p_thesis_clock:a[6],
   p_bull_case:(a[7]??null) as string|null,p_bear_case:(a[8]??null) as string|null,
   p_monitoring:(a[9]??null) as string|null,p_invalidation:(a[10]??null) as string|null,
   p_notes:(a[11]??null) as string|null,p_ag_thesis_valid:(a[12]??null) as boolean|null,
   p_ag_liquidity_eligible:(a[13]??null) as boolean|null,
   p_ag_evidence_version:(a[14]??null) as string|null,p_ag_theme_key:(a[15]??null) as string|null};
 });
}
export function prepareAgPersistenceDecisionCalls(input:{
 cycleId:string;claimToken:string;holding:Record<string,unknown>;committee:Record<string,unknown>;
}):readonly AgRpcCall[]{
 if(!UUID.test(input.cycleId)||!UUID.test(input.claimToken))throw new Error("Invalid AG persistence claim");
 const all=[...rows(input.holding,"holding_review",input.cycleId,input.claimToken),
   ...rows(input.committee,"committee",input.cycleId,input.claimToken)];
 const seen=new Set<string>();
 for(const call of all){
  if(seen.has(call.p_ticker))throw new Error("AG persistence manifests overlap");
  seen.add(call.p_ticker);
 }
 return all;
}
