/** Read-only reconciliation of frozen watchlist intent against a durable
 * operation ledger. This never authorizes blind replay or performs writes.
 * The eventual database RPC must derive the digest server-side from the
 * same canonical payload; do not treat caller-authored hashes as evidence.
 */
import type { AgWatchIntent } from "./watchlist-intent-capture";
export type AgWatchLedgerRow = {
  cycle_id:string; stream:AgWatchIntent["stream"]; symbol:string;
  action:AgWatchIntent["action"]; payload_json:string;
  status:"pending"|"committed"; affected_row_id:string|null;
};
export type AgWatchReconciliation = {
  status:"VERIFIED_RECORDED_REQUIRES_DB_POSTCONDITIONS"|"REQUIRES_MANUAL_RECONCILIATION";
  recorded:readonly string[]; missing:readonly string[]; conflicting:readonly string[];
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const key=(x:{stream:string;symbol:string})=>x.stream+":"+x.symbol;
function canonical(value:unknown):string {
  if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
  if(value!==null && typeof value==="object"){
    const obj=value as Record<string,unknown>;
    return "{"+Object.keys(obj).sort().map(k=>JSON.stringify(k)+":"+canonical(obj[k])).join(",")+"}";
  }
  if(value===undefined || typeof value==="function" || typeof value==="symbol" ||
     (typeof value==="number" && !Number.isFinite(value))){
    throw new Error("Invalid AG watch payload");
  }
  return JSON.stringify(value);
}
export function canonicalAgWatchOperation(intent:AgWatchIntent):string {
  return canonical(intent);
}
export function reconcileAgWatchlistIntent(input:{
  cycleId:string;intents:readonly AgWatchIntent[];ledger:readonly AgWatchLedgerRow[];
}):AgWatchReconciliation {
  if(!UUID.test(input.cycleId)||!Array.isArray(input.intents)||
     !Array.isArray(input.ledger))throw new Error("Invalid AG watch reconciliation");
  const expected=new Map<string,string>();
  for(const intent of input.intents){
    const k=key(intent);
    if(expected.has(k))throw new Error("Duplicate AG watch operation identity");
    expected.set(k,canonicalAgWatchOperation(intent));
  }
  const seen=new Set<string>(),recorded:string[]=[],missing:string[]=[],conflicting:string[]=[];
  for(const row of input.ledger){
    const k=key(row);
    if(seen.has(k)) {conflicting.push(k);continue;}
    seen.add(k);
    if(row.cycle_id!==input.cycleId || !expected.has(k) ||
       !UUID.test(row.affected_row_id??"") ||
       row.status!=="committed" ||
       row.action!==input.intents.find(x=>key(x)===k)?.action ||
       row.payload_json!==expected.get(k)){
      conflicting.push(k);continue;
    }
    recorded.push(k);
  }
  for(const k of expected.keys())if(!seen.has(k))missing.push(k);
  return {status:conflicting.length===0 && missing.length===0
    ?"VERIFIED_RECORDED_REQUIRES_DB_POSTCONDITIONS"
    :"REQUIRES_MANUAL_RECONCILIATION",recorded,missing,conflicting};
}
