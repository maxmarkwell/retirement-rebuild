import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDynamicDiscoveryUniverse } from "../dynamic-universe";
import { passesAgTradabilityGate } from "./discovery";
import { researchAgOpportunityDiscoveryStep } from "./opportunity-discovery-step";
import { rankAgOpportunityResearch } from "./rank-opportunity-research";

const VERSION = "ag-opportunity-v2";
const POOL_SIZE = 12;
type Result = Awaited<ReturnType<typeof researchAgOpportunityDiscoveryStep>>;
type PoolState = { version: typeof VERSION; poolVersion: "ag-pool-v1";
  poolSymbols: string[]; poolCursor: number; poolResults: Result[] };
const validSymbol = (s: string) => /^[A-Z][A-Z0-9.-]{0,14}$/.test(s);

/** Preview a reproducible research pool, not a merit ranking. No historical WATCH reuse. */
export async function previewAgOpportunityPool() {
  const stocks = (await getDynamicDiscoveryUniverse()).filter(passesAgTradabilityGate);
  const unique = [...new Map(stocks.map(s => [s.ticker.toUpperCase(),s])).values()]
    .sort((a,b) => a.ticker.localeCompare(b.ticker));
  if (unique.length < POOL_SIZE) throw new Error("AG_POOL_INSUFFICIENT_ELIGIBLE_UNIVERSE");
  const symbols = Array.from({ length: POOL_SIZE }, (_,i) =>
    unique[Math.floor((i + 0.5) * unique.length / POOL_SIZE)].ticker.toUpperCase());
  if (new Set(symbols).size !== POOL_SIZE) throw new Error("AG_POOL_DUPLICATE_SYMBOLS");
  return { symbols, eligibleUniverse: unique.length, poolSize: POOL_SIZE,
    method: "reproducible_broad_pool_v1" as const };
}

export async function initializeAgOpportunityPool() {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("AG_POOL_AUTH_REQUIRED");
  const { data: active, error: activeError } = await db.from("discovery_scan_runs")
    .select("id").eq("user_id",user.id).eq("portfolio_type","paper_active")
    .eq("scoring_version",VERSION).in("status",["pending","running"]).limit(1);
  if (activeError || !active || active.length) throw new Error("AG_POOL_ACTIVE_SCAN_EXISTS");
  const preview = await previewAgOpportunityPool();
  const state: PoolState = { version: VERSION, poolVersion: "ag-pool-v1",
    poolSymbols: preview.symbols, poolCursor: 0, poolResults: [] };
  const { data, error } = await db.from("discovery_scan_runs").insert({
    user_id: user.id, portfolio_type: "paper_active", scoring_version: VERSION,
    status:"running",stage:"ag_v2_pool_ready",prescreen_count: POOL_SIZE,state,
  }).select("id").single();
  if (error || !data) throw new Error("AG_POOL_CREATE_FAILED");
  return { scanRunId:data.id as string, ...preview };
}

/** Exactly one external evidence call per step, with durable checkpoints and no replay on interruption. */
export async function processAgOpportunityPoolStep(scanRunId: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("AG_POOL_AUTH_REQUIRED");
  const { data: scan, error } = await db.from("discovery_scan_runs")
    .select("id,stage,status,scoring_version,portfolio_type,state")
    .eq("id",scanRunId).eq("user_id",user.id).maybeSingle();
  if (error || !scan || scan.scoring_version !== VERSION || scan.portfolio_type !== "paper_active" ||
      scan.status !== "running" || scan.stage !== "ag_v2_pool_ready")
    throw new Error("AG_POOL_REQUIRES_RECONCILIATION");
  const state = scan.state as PoolState | null;
  if (!state || state.version !== VERSION || state.poolVersion !== "ag-pool-v1" ||
      !Array.isArray(state.poolSymbols) || state.poolSymbols.length !== POOL_SIZE ||
      new Set(state.poolSymbols).size !== POOL_SIZE ||
      state.poolSymbols.some(s => typeof s !== "string" || !validSymbol(s)) ||
      !Array.isArray(state.poolResults) || !Number.isInteger(state.poolCursor) ||
      state.poolCursor < 0 || state.poolCursor > POOL_SIZE ||
      state.poolResults.length !== state.poolCursor ||
      state.poolResults.some((r,i) => r.symbol !== state.poolSymbols[i] ||
        r.version !== "ag-opportunity-research-v1"))
    throw new Error("AG_POOL_INVALID_SAVED_STATE");
  if (state.poolCursor === POOL_SIZE) {
    const ranked = rankAgOpportunityResearch(state.poolResults);
    if (ranked.length < 5) {
      const { data, error: finalError } = await db.from("discovery_scan_runs")
        .update({status:"completed",stage:"ag_v2_pool_insufficient",
          completed_at:new Date().toISOString(),
          state:{...state,rankedPoolCandidates:ranked}})
        .eq("id",scanRunId).eq("user_id",user.id).eq("status","running")
        .eq("stage","ag_v2_pool_ready").select("id").maybeSingle();
      if (finalError || !data) throw new Error("AG_POOL_FINALIZATION_UNCONFIRMED");
      return {scanRunId, outcome:"insufficient_qualified" as const,qualified:ranked.length};
    }
    const top = ranked.slice(0,5);
    const symbols = top.map(r=>r.symbol);
    const results = symbols.map(symbol=>state.poolResults.find(r=>r.symbol===symbol)!);
    const rankedQualifiedCandidates = rankAgOpportunityResearch(results);
    const { data, error: finalError } = await db.from("discovery_scan_runs")
      .update({status:"completed",stage:"ag_v2_complete",
        completed_at:new Date().toISOString(),completed_count:5,
        deep_candidate_count:5,
        state:{...state,symbols,cursor:5,results,rankedQualifiedCandidates,
          selectionMethod:"evidence_ranked_from_twelve_v1",
          poolQualifiedCount:ranked.length}})
      .eq("id",scanRunId).eq("user_id",user.id).eq("status","running")
      .eq("stage","ag_v2_pool_ready").select("id").maybeSingle();
    if (finalError || !data) throw new Error("AG_POOL_FINALIZATION_UNCONFIRMED");
    return {scanRunId,outcome:"ranked_five" as const,symbols,qualified:ranked.length};
  }
  const { data: claimed, error: claimError } = await db.from("discovery_scan_runs")
    .update({stage:"ag_v2_pool_claimed"}).eq("id",scanRunId).eq("user_id",user.id)
    .eq("status","running").eq("stage","ag_v2_pool_ready").select("id").maybeSingle();
  if (claimError || !claimed) throw new Error("AG_POOL_ALREADY_CLAIMED");
  const symbol = state.poolSymbols[state.poolCursor];
  const result = await researchAgOpportunityDiscoveryStep({symbol});
  if (result.symbol !== symbol || result.version !== "ag-opportunity-research-v1")
    throw new Error("AG_POOL_RESEARCH_MISMATCH");
  const next: PoolState = {...state,poolCursor:state.poolCursor+1,
    poolResults:[...state.poolResults,result]};
  const { data: saved,error: saveError } = await db.from("discovery_scan_runs")
    .update({stage:"ag_v2_pool_ready",state:next}).eq("id",scanRunId).eq("user_id",user.id)
    .eq("status","running").eq("stage","ag_v2_pool_claimed").select("id").maybeSingle();
  if (saveError || !saved) throw new Error("AG_POOL_PERSISTENCE_UNCONFIRMED");
  return {scanRunId,outcome:"running" as const,completed:next.poolCursor,total:POOL_SIZE};
}
