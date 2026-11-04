import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { captureAgFinancialEvidence, VERSION, type Evidence } from "@/lib/discovery/accelerated-growth/evidence-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const uuid = (x: unknown): x is string => typeof x === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
const error = (code: string, status: number) =>
  NextResponse.json({ error: code, executionEnabled: false, transactionsWritten: false },
    { status, headers });
type Saved = {
  version: string; symbol: string; cursor: number; evidence: Evidence | null;
};
type Row = { id: string; status: string; stage: string; state: unknown; created_at: string };
function stateOf(value: unknown): Saved {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("AG_EVIDENCE_BAD_STATE");
  const s = value as Record<string, unknown>;
  if (s.version !== VERSION || typeof s.symbol !== "string" ||
      !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s.symbol) ||
      !Number.isInteger(s.cursor) || (s.cursor !== 0 && s.cursor !== 1) ||
      (s.cursor === 0 && s.evidence !== null) ||
      (s.cursor === 1 && (!s.evidence || typeof s.evidence !== "object" ||
        (s.evidence as Record<string, unknown>).symbol !== s.symbol)))
    throw new Error("AG_EVIDENCE_BAD_STATE");
  return s as Saved;
}
function result(row: Row) {
  const s = stateOf(row.state);
  return { scanRunId: row.id, version: VERSION, symbol: s.symbol,
    status: row.status, stage: row.stage, completed: s.cursor, total: 1,
    evidence: s.evidence, requiresReconciliation: row.stage === "ag_evidence_claimed",
    createdAt: row.created_at, executionEnabled: false, transactionsWritten: false };
}
async function session() {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  return !authError && user ? { db, user } : null;
}
type DB = NonNullable<Awaited<ReturnType<typeof session>>>["db"];
async function load(db: DB, userId: string, id: string) {
  const { data, error: queryError } = await db.from("discovery_scan_runs")
    .select("id,status,stage,state,created_at").eq("id", id).eq("user_id", userId)
    .eq("portfolio_type", "paper_active").eq("scoring_version", VERSION).maybeSingle();
  if (queryError) throw new Error("AG_EVIDENCE_READ_FAILED");
  return data as Row | null;
}
export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return error("AUTH_REQUIRED", 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!uuid(id)) return error("AG_EVIDENCE_INVALID_ID", 400);
  try {
    const row = await load(auth.db, auth.user.id, id);
    if (!row) return error("AG_EVIDENCE_NOT_FOUND", 404);
    return NextResponse.json(result(row), { headers });
  } catch { return error("AG_EVIDENCE_READ_FAILED", 500); }
}

/**
 * Explicit manual start/run. This route only writes its versioned research
 * state in discovery_scan_runs; no decisions, trades, or portfolio writes.
 */
export async function POST(request: NextRequest) {
  const auth = await session();
  if (!auth) return error("AUTH_REQUIRED", 401);
  let body: { action?: unknown; symbol?: unknown; id?: unknown };
  try { body = await request.json(); }
  catch { return error("AG_EVIDENCE_INVALID_REQUEST", 400); }
  if (!body || typeof body !== "object") return error("AG_EVIDENCE_INVALID_REQUEST", 400);
  const { db, user } = auth;
  if (body.action === "start") {
    const symbol = typeof body.symbol === "string" ? body.symbol.trim().toUpperCase() : "";
    if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) return error("AG_EVIDENCE_INVALID_SYMBOL", 400);
    const { data, error: insertError } = await db.from("discovery_scan_runs").insert({
      user_id: user.id, portfolio_type: "paper_active", scoring_version: VERSION,
      status: "running", stage: "ag_evidence_ready", prescreen_count: 1,
      state: { version: VERSION, symbol, cursor: 0, evidence: null },
    }).select("id,status,stage,state,created_at").single();
    if (insertError || !data) return error("AG_EVIDENCE_ACTIVE_OR_UNAVAILABLE", 409);
    return NextResponse.json(result(data as Row), { headers });
  }
  if (body.action !== "run" || !uuid(body.id)) return error("AG_EVIDENCE_INVALID_ACTION", 400);
  let row: Row | null;
  try { row = await load(db, user.id, body.id); }
  catch { return error("AG_EVIDENCE_READ_FAILED", 500); }
  if (!row) return error("AG_EVIDENCE_NOT_FOUND", 404);
  if (row.status === "completed" && row.stage === "ag_evidence_complete")
    return NextResponse.json(result(row), { headers });
  if (row.status !== "running" || row.stage !== "ag_evidence_ready")
    return error("AG_EVIDENCE_REQUIRES_RECONCILIATION", 409);
  let state: Saved;
  try { state = stateOf(row.state); if (state.cursor !== 0) throw new Error("BAD_CURSOR"); }
  catch { return error("AG_EVIDENCE_INVALID_SAVED_STATE", 409); }
  const { data: claimed, error: claimError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_evidence_claimed" }).eq("id", row.id).eq("user_id", user.id)
    .eq("portfolio_type", "paper_active").eq("scoring_version", VERSION)
    .eq("status", "running").eq("stage", "ag_evidence_ready")
    .select("id").maybeSingle();
  if (claimError || !claimed) return error("AG_EVIDENCE_CONCURRENT_CHANGE", 409);
  // The claim persists across provider errors/timeouts; no silent double request.
  let evidence: Evidence;
  try { evidence = await captureAgFinancialEvidence(state.symbol); }
  catch { return error("AG_EVIDENCE_PROVIDER_OR_VALIDATION_FAILED_RECONCILE", 409); }
  const next: Saved = { ...state, cursor: 1, evidence };
  const { data: saved, error: saveError } = await db.from("discovery_scan_runs")
    .update({ state: next, stage: "ag_evidence_complete", status: "completed",
      completed_count: 1, completed_at: new Date().toISOString() })
    .eq("id", row.id).eq("user_id", user.id).eq("portfolio_type", "paper_active")
    .eq("scoring_version", VERSION).eq("status", "running").eq("stage", "ag_evidence_claimed")
    .select("id,status,stage,state,created_at").maybeSingle();
  if (saveError || !saved) return error("AG_EVIDENCE_PERSISTENCE_UNCONFIRMED", 409);
  return NextResponse.json(result(saved as Row), { headers });
}
