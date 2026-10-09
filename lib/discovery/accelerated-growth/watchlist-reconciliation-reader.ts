import "server-only";
import { createClient } from "@/lib/supabase/server";
import {
  prepareAgWatchPostconditionArgs,
  type AgWatchLedgerRow,
} from "./watchlist-reconciliation";
import type { AgWatchIntent } from "./watchlist-intent-capture";

type AgWatchLedgerRpcRow={
  cycle_id:string;stream:string;ticker:string;action:string;source_row_id:string|null;
  payload_hash:string;status:string;effect:string|null;affected_row_id:string|null;
  user_id:string;portfolio_id:string;strategy_era_id:string;
};

const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Isolated read-only recovery boundary. Requires reviewed/deployed draft
 * schema before use and is deliberately not imported by the active AG runner.
 */
export async function selectAgWatchLedgerRows(query:{
  cycleId:string;userId:string;portfolioId:string;strategyEraId:string;
}):Promise<readonly AgWatchLedgerRow[]>{
  if(!UUID.test(query.cycleId)||!UUID.test(query.userId)||
     !UUID.test(query.portfolioId)||!UUID.test(query.strategyEraId))
    throw new Error("Invalid AG watch ledger scope.");
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user||user.id.toLowerCase()!==query.userId.toLowerCase())
    throw new Error("AG watch verification requires the authenticated cycle owner.");
  const {data,error}=await supabase.rpc("ag_read_cycle_watch_ledger",{
    p_cycle_id:query.cycleId,
  });
  if(error||!data)throw new Error("Unable to read AG watch operation ledger.");
  const rows=data as AgWatchLedgerRpcRow[];
  if(rows.some((row)=>row.user_id?.toLowerCase()!==query.userId.toLowerCase()||
    row.portfolio_id?.toLowerCase()!==query.portfolioId.toLowerCase()||
    row.strategy_era_id?.toLowerCase()!==query.strategyEraId.toLowerCase()))
    throw new Error("AG watch ledger scope mismatch.");
  return rows.map((row)=>({
    cycle_id:row.cycle_id,stream:row.stream as AgWatchIntent["stream"],
    symbol:row.ticker,action:row.action as AgWatchIntent["action"],
    source_row_id:row.source_row_id,payload_hash:row.payload_hash,
    status:row.status as AgWatchLedgerRow["status"],
    effect:row.effect as AgWatchLedgerRow["effect"],
    affected_row_id:row.affected_row_id,
  }));
}

/** Calls only the read-only SECURITY DEFINER verifier. False/error is never
 * converted into permission to retry.
 */
export async function verifyAgWatchOperationPostcondition(
  cycleId:string,intent:AgWatchIntent,
):Promise<boolean>{
  const supabase=await createClient();
  const {data:{user},error:authError}=await supabase.auth.getUser();
  if(authError||!user)return false;
  const args=prepareAgWatchPostconditionArgs(cycleId,intent);
  const {data,error}=await supabase.rpc("ag_verify_watch_operation_postcondition",args);
  return !error && data===true;
}
