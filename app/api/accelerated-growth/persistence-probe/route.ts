import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AG_PERSISTENCE_PROBE_STAGE, AG_PERSISTENCE_PROBE_VERSION,
  normalizeProbeSymbols, readProbeState, nextProbeState,
} from "@/lib/discovery/accelerated-growth/persistence-probe";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "no-store" };
const validId = (value: unknown): value is string =>
  typeof value === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);

type ScanRow = {
  id: string; status: string; stage: string; state: unknown; created_at: string;
};
function present(scan: ScanRow) {
  const state = readProbeState(scan.state);
  return {
    scanRunId: scan.id, version: state.version, status: scan.status,
    stage: scan.stage, symbols: state.symbols, completed: state.cursor,
    total: state.symbols.length, checkpoints: state.results, createdAt: scan.created_at,
    requiresReconciliation: scan.stage === "ag_probe_claimed",
    executionEnabled: false, transactionsWritten: false,
  };
}
function failure(code: string, status: number) {
  return NextResponse.json({ error: code, executionEnabled: false },
    { status, headers });
}

async function session() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return null;
  return { db, user };
}
async function load(db: NonNullable<Awaited<ReturnType<typeof session>>>["db"], userId: string, id: string) {
  const { data, error } = await db.from("discovery_scan_runs")
    .select("id,status,stage,state,created_at")
    .eq("id", id).eq("user_id", userId)
    .eq("portfolio_type", "paper_active")
    .eq("scoring_version", AG_PERSISTENCE_PROBE_VERSION).maybeSingle();
  if (error) throw new Error("AG_PROBE_READ_FAILED");
  return data as ScanRow | null;
}

/** Inspect saved progress without side effects. */
export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return failure("AUTH_REQUIRED", 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!validId(id)) return failure("AG_PROBE_INVALID_ID", 400);
  try {
    const scan = await load(auth.db, auth.user.id, id);
    if (!scan) return failure("AG_PROBE_NOT_FOUND", 404);
    return NextResponse.json(present(scan), { headers });
  } catch {
    return failure("AG_PROBE_READ_FAILED", 500);
  }
}

/**
 * Start and step are explicit manual test actions. No research providers,
 * investment_decisions, transactions or portfolio balances are accessed.
 */
export async function POST(request: NextRequest) {
  const auth = await session();
  if (!auth) return failure("AUTH_REQUIRED", 401);
  let body: { action?: unknown; symbols?: unknown; id?: unknown };
  try { body = await request.json(); }
  catch { return failure("AG_PROBE_INVALID_REQUEST", 400); }
  if (!body || typeof body !== "object") return failure("AG_PROBE_INVALID_REQUEST", 400);

  const { db, user } = auth;
  if (body.action === "start") {
    let symbols: string[];
    try { symbols = normalizeProbeSymbols(body.symbols); }
    catch { return failure("AG_PROBE_INVALID_SYMBOLS", 400); }
    // The partial unique index is authoritative for concurrent starts.
    const { data, error } = await db.from("discovery_scan_runs").insert({
      user_id: user.id,
      portfolio_type: "paper_active",
      scoring_version: AG_PERSISTENCE_PROBE_VERSION,
      status: "running", stage: AG_PERSISTENCE_PROBE_STAGE,
      prescreen_count: symbols.length,
      state: { version: AG_PERSISTENCE_PROBE_VERSION, symbols, cursor: 0, results: [] },
    }).select("id,status,stage,state,created_at").single();
    if (error || !data) return failure("AG_PROBE_ACTIVE_OR_UNAVAILABLE", 409);
    return NextResponse.json(present(data as ScanRow), { headers });
  }
  if (body.action !== "step" || !validId(body.id)) {
    return failure("AG_PROBE_INVALID_ACTION", 400);
  }
  try {
    const scan = await load(db, user.id, body.id);
    if (!scan) return failure("AG_PROBE_NOT_FOUND", 404);
    if (scan.status === "completed" && scan.stage === "ag_probe_complete") {
      return NextResponse.json(present(scan), { headers });
    }
    if (scan.status !== "running" || scan.stage !== AG_PERSISTENCE_PROBE_STAGE) {
      return failure("AG_PROBE_REQUIRES_RECONCILIATION", 409);
    }
    const state = readProbeState(scan.state);
    if (state.cursor === state.symbols.length) {
      const { data, error } = await db.from("discovery_scan_runs")
        .update({ status: "completed", stage: "ag_probe_complete",
          completed_at: new Date().toISOString(), completed_count: state.cursor })
        .eq("id", scan.id).eq("user_id", user.id)
        .eq("portfolio_type", "paper_active")
        .eq("scoring_version", AG_PERSISTENCE_PROBE_VERSION)
        .eq("status", "running").eq("stage", AG_PERSISTENCE_PROBE_STAGE)
        .select("id,status,stage,state,created_at").maybeSingle();
      if (error || !data) return failure("AG_PROBE_CONCURRENT_CHANGE", 409);
      return NextResponse.json(present(data as ScanRow), { headers });
    }
    const { data: claim, error: claimError } = await db.from("discovery_scan_runs")
      .update({ stage: "ag_probe_claimed" })
      .eq("id", scan.id).eq("user_id", user.id)
      .eq("portfolio_type", "paper_active")
      .eq("scoring_version", AG_PERSISTENCE_PROBE_VERSION)
      .eq("status", "running").eq("stage", AG_PERSISTENCE_PROBE_STAGE)
      .select("id").maybeSingle();
    if (claimError || !claim) return failure("AG_PROBE_CONCURRENT_CHANGE", 409);
    const next = nextProbeState(state);
    const { data, error } = await db.from("discovery_scan_runs")
      .update({ state: next, stage: AG_PERSISTENCE_PROBE_STAGE, completed_count: next.cursor })
      .eq("id", scan.id).eq("user_id", user.id)
      .eq("portfolio_type", "paper_active")
      .eq("scoring_version", AG_PERSISTENCE_PROBE_VERSION)
      .eq("status", "running").eq("stage", "ag_probe_claimed")
      .select("id,status,stage,state,created_at").maybeSingle();
    if (error || !data) return failure("AG_PROBE_REQUIRES_RECONCILIATION", 409);
    return NextResponse.json(present(data as ScanRow), { headers });
  } catch {
    return failure("AG_PROBE_REQUIRES_RECONCILIATION", 409);
  }
}
