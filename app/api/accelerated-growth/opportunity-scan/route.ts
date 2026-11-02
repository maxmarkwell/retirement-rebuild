import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { initializeAgOpportunityScan } from "@/lib/discovery/accelerated-growth/initialize-opportunity-scan";
import { processAgOpportunityScanStep } from "@/lib/discovery/accelerated-growth/process-opportunity-scan";
import { processAgOpportunityDeepStep } from "@/lib/discovery/accelerated-growth/process-opportunity-deep";
import { processAgV2CommitteeStep } from "@/lib/discovery/accelerated-growth/process-opportunity-committee";
import { getAgExploratoryShortlist } from "@/lib/discovery/accelerated-growth/auto-opportunity-shortlist";
import { initializeAgOpportunityPool, processAgOpportunityPoolStep } from "@/lib/discovery/accelerated-growth/opportunity-pool";

export const dynamic = "force-dynamic";
export const maxDuration = 300;
const VERSION = "ag-opportunity-v2";

async function loadScan(id: string) {
  const db = await createClient();
  const { data: { user } } = await db.auth.getUser();
  if (!user) throw new Error("AG_V2_AUTH_REQUIRED");
  const { data, error } = await db.from("discovery_scan_runs")
    .select("id,status,stage,state,scoring_version,portfolio_type")
    .eq("id", id).eq("user_id", user.id).maybeSingle();
  if (error || !data || data.portfolio_type !== "paper_active" || data.scoring_version !== VERSION)
    throw new Error("AG_V2_SCAN_NOT_FOUND");
  const state = data.state as {
    symbols?: string[]; cursor?: number; results?: unknown[];
    rankedQualifiedCandidates?: unknown[]; deepCursor?: number; deepResults?: unknown[];
    committeeCursor?: number; committeeResults?: Array<{symbol:string;decision:string;rationale:string;ownershipThesis:string}>;
  } | null;
  return {
    id: data.id, status: data.status, stage: data.stage,
    total: state?.symbols?.length ?? 0, discoveryCompleted: state?.cursor ?? 0,
    qualified: state?.rankedQualifiedCandidates?.length ?? null,
    deepCompleted: state?.deepCursor ?? 0,
    committeeCompleted: state?.committeeCursor ?? 0,
    committeeTotal: state?.deepResults?.length ?? 0,
    committeeResults: state?.committeeResults ?? [],
    poolCompleted: (state as { poolCursor?: number } | null)?.poolCursor ?? null,
    poolTotal: (state as { poolSymbols?: string[] } | null)?.poolSymbols?.length ?? null,
    poolQualified: (state as { poolQualifiedCount?: number } | null)?.poolQualifiedCount ?? null,
    poolRanking: ((state as { poolResults?: Array<{symbol:string; qualification?: {status:string; strongestPath:string|null; rankingScore:number|null}}> } | null)?.poolResults ?? [])
      .map(r => ({symbol:r.symbol,status:r.qualification?.status ?? "UNKNOWN",
        path:r.qualification?.strongestPath ?? null,score:r.qualification?.rankingScore ?? null}))
      .sort((a,b) => (b.score ?? -1)-(a.score ?? -1) || a.symbol.localeCompare(b.symbol)),
    selectionMethod: (state as { selectionMethod?: string } | null)?.selectionMethod ?? null,
    symbols: state?.symbols ?? [], requiresReconciliation: String(data.stage).endsWith("_claimed"),
  };
}
function failure(error: unknown) {
  const message = error instanceof Error ? error.message : "AG_V2_UNEXPECTED_ERROR";
  const code = message.includes("AUTH_REQUIRED") ? 401 : message.includes("ALREADY_ACTIVE") || message.includes("REQUIRES_RECONCILIATION") || message.includes("ALREADY_CLAIMED") ? 409 : 400;
  return NextResponse.json({ error: message, executionEnabled: false }, { status: code });
}
export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id") ?? "";
    if (!/^[0-9a-f-]{36}$/i.test(id)) throw new Error("AG_V2_INVALID_ID");
    return NextResponse.json(await loadScan(id));
  } catch (error) { return failure(error); }
}
export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as { action?: string; symbols?: unknown; id?: unknown };
    if (body.action === "start_pool") {
      const result = await initializeAgOpportunityPool();
      return NextResponse.json({ ...result, ...(await loadScan(result.scanRunId)), executionEnabled: false });
    }
    if (body.action === "suggest") {
      const db = await createClient();
      const { data: { user } } = await db.auth.getUser();
      if (!user) throw new Error("AG_V2_AUTH_REQUIRED");
      const shortlist = await getAgExploratoryShortlist();
      return NextResponse.json({ ...shortlist, executionEnabled: false });
    }
    if (body.action === "start") {
      if (!Array.isArray(body.symbols) || body.symbols.length !== 5 || body.symbols.some(s => typeof s !== "string"))
        throw new Error("AG_V2_REQUIRES_FIVE_SYMBOLS");
      const result = await initializeAgOpportunityScan({ symbols: body.symbols as string[] });
      return NextResponse.json({ ...result, ...(await loadScan(result.scanRunId)), executionEnabled: false });
    }
    if (body.action === "next" && typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id)) {
      const before = await loadScan(body.id);
      if (before.requiresReconciliation) throw new Error("AG_V2_REQUIRES_RECONCILIATION");
      if (before.status === "running" && before.stage === "ag_v2_pool_ready") {
        await processAgOpportunityPoolStep(body.id);
      } else if (before.status === "running" && before.stage === "ag_v2_ready") {
        await processAgOpportunityScanStep(body.id);
      } else if (before.status === "completed" && before.stage === "ag_v2_complete") {
        await processAgOpportunityDeepStep(body.id);
      } else if (before.status === "completed" && before.stage === "ag_v2_deep_complete") {
        await processAgV2CommitteeStep(body.id);
      } else if (before.stage !== "ag_v2_committee_complete") {
        throw new Error("AG_V2_REQUIRES_RECONCILIATION");
      }
      return NextResponse.json({ ...(await loadScan(body.id)), executionEnabled: false });
    }
    throw new Error("AG_V2_INVALID_ACTION");
  } catch (error) { return failure(error); }
}
