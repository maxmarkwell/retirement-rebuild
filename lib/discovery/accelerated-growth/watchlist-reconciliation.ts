/** Read-only reconciliation of frozen watchlist intent against a durable
 * operation ledger. This never authorizes blind replay or performs writes.
 * Ledger shape is preliminary evidence only: payload equality and actual row
 * postconditions are established by the read-only database verifier.
 */
import type { AgWatchIntent } from "./watchlist-intent-capture";

export type AgWatchLedgerRow = {
  cycle_id:string; stream:AgWatchIntent["stream"]; symbol:string;
  action:AgWatchIntent["action"]; source_row_id:string|null;
  payload_hash:string; status:"pending"|"committed";
  effect:"applied"|"noop"; affected_row_id:string|null;
};
export type AgWatchReconciliation = {
  status:"RECORDED_REQUIRES_DB_POSTCONDITIONS"|"REQUIRES_MANUAL_RECONCILIATION";
  recorded:readonly string[]; missing:readonly string[]; conflicting:readonly string[];
};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const HASH=/^[0-9a-f]{64}$/;
const key=(x:{stream:string;symbol:string})=>x.stream+":"+x.symbol;

export function reconcileAgWatchlistIntent(input:{
  cycleId:string;intents:readonly AgWatchIntent[];ledger:readonly AgWatchLedgerRow[];
}):AgWatchReconciliation {
  if(!UUID.test(input.cycleId)||!Array.isArray(input.intents)||
     !Array.isArray(input.ledger))throw new Error("Invalid AG watch reconciliation");
  const expected=new Map<string,AgWatchIntent>();
  for(const intent of input.intents){
    const k=key(intent);
    if(expected.has(k))throw new Error("Duplicate AG watch operation identity");
    expected.set(k,intent);
  }
  const seen=new Set<string>(),recorded:string[]=[],missing:string[]=[],conflicting:string[]=[];
  for(const row of input.ledger){
    const k=key(row),intent=expected.get(k);
    if(seen.has(k)){conflicting.push(k);continue;}
    seen.add(k);
    if(row.cycle_id!==input.cycleId || !intent ||
       row.status!=="committed" || !HASH.test(row.payload_hash) ||
       row.action!==intent.action ||
       row.source_row_id!==(intent.source_row_id??null) ||
       (row.effect==="applied" ? !UUID.test(row.affected_row_id??"") : row.affected_row_id!==null) ||
       !["applied","noop"].includes(row.effect)){
      conflicting.push(k);continue;
    }
    recorded.push(k);
  }
  for(const k of expected.keys())if(!seen.has(k))missing.push(k);
  return {status:conflicting.length===0 && missing.length===0
    ?"RECORDED_REQUIRES_DB_POSTCONDITIONS"
    :"REQUIRES_MANUAL_RECONCILIATION",recorded,missing,conflicting};
}

/** Timeout-after-commit recovery boundary. The injected verifier must call the
 * read-only database postcondition verifier with the exact frozen operation.
 * Any false/throw is manual reconciliation; this function never retries writes.
 */
export async function verifyAgWatchlistAfterAmbiguousWrite(input:{
  cycleId:string;intents:readonly AgWatchIntent[];ledger:readonly AgWatchLedgerRow[];
},verifyPostcondition:(cycleId:string,intent:AgWatchIntent)=>Promise<boolean>):
Promise<"COMPLETE"|"MANUAL_RECONCILIATION">{
  const preliminary=reconcileAgWatchlistIntent(input);
  if(preliminary.status!=="RECORDED_REQUIRES_DB_POSTCONDITIONS")
    return "MANUAL_RECONCILIATION";
  try{
    for(const intent of input.intents){
      if(!await verifyPostcondition(input.cycleId,intent))
        return "MANUAL_RECONCILIATION";
    }
    return "COMPLETE";
  }catch{
    return "MANUAL_RECONCILIATION";
  }
}
