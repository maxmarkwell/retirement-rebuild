import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  SEC_VERIFY_VERSION, verifyAgSecIssuer, type SecEvidence,
} from "@/lib/discovery/accelerated-growth/sec-issuer-verification";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = (code: string, status: number) =>
  NextResponse.json({ error: code, executionEnabled: false, transactionsWritten: false },
    { status, headers });
type Source = { symbol: string; vendorIssuerName: string; vendorFiscalEnd: string;
  vendorFilingDate: string; vendorCaptureTime: string };
type State = { version: typeof SEC_VERIFY_VERSION; sourceScanId: string;
  source: Source; verification: SecEvidence | null };
type Row = { id: string; status: string; stage: string; state: unknown; created_at: string };
function parseState(data: unknown): State {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("AG_SEC_BAD_STATE");
  const v = data as Record<string, unknown>;
  if (v.version !== SEC_VERIFY_VERSION || !uuid(v.sourceScanId) ||
      !v.source || typeof v.source !== "object" ||
      !/^[A-Z][A-Z0-9.-]{0,14}$/.test((v.source as Source).symbol) ||
      (v.verification !== null && (!v.verification || typeof v.verification !== "object" ||
        (v.verification as SecEvidence).symbol !== (v.source as Source).symbol)))
    throw new Error("AG_SEC_BAD_STATE");
  return v as State;
}
function present(row: Row) {
  const s = parseState(row.state);
  return { scanRunId: row.id, version: SEC_VERIFY_VERSION, sourceScanId: s.sourceScanId,
    symbol: s.source.symbol, status: row.status, stage: row.stage,
    verification: s.verification, requiresReconciliation: row.stage === "ag_sec_claimed",
    executionEnabled: false, transactionsWritten: false, createdAt: row.created_at };
}
async function session() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  return !error && user ? { db, user } : null;
}
type DB = NonNullable<Awaited<ReturnType<typeof session>>>["db"];
async function load(db: DB, userId: string, id: string) {
  const { data, error } = await db.from("discovery_scan_runs")
    .select("id,status,stage,state,created_at").eq("id", id).eq("user_id", userId)
    .eq("portfolio_type", "paper_active").eq("scoring_version", SEC_VERIFY_VERSION).maybeSingle();
  if (error) throw new Error("AG_SEC_DB_READ_FAILED");
  return data as Row | null;
}
export async function GET(req: NextRequest) {
  const auth = await session();
  if (!auth) return fail("AUTH_REQUIRED", 401);
  const id = req.nextUrl.searchParams.get("id");
  if (!uuid(id)) return fail("AG_SEC_INVALID_ID", 400);
  try {
    const row = await load(auth.db, auth.user.id, id);
    if (!row) return fail("AG_SEC_NOT_FOUND", 404);
    return NextResponse.json(present(row), { headers });
  } catch { return fail("AG_SEC_READ_FAILED", 500); }
}
export async function POST(req: NextRequest) {
  const auth = await session();
  if (!auth) return fail("AUTH_REQUIRED", 401);
  let body: { action?: unknown; sourceScanId?: unknown; id?: unknown };
  try { body = await req.json(); }
  catch { return fail("AG_SEC_INVALID_REQUEST", 400); }
  if (!body || typeof body !== "object") return fail("AG_SEC_INVALID_REQUEST", 400);
  const { db, user } = auth;
  if (body.action === "start") {
    if (!uuid(body.sourceScanId)) return fail("AG_SEC_INVALID_SOURCE_ID", 400);
    const { data, error } = await db.from("discovery_scan_runs")
      .select("id,status,stage,state").eq("id", body.sourceScanId)
      .eq("user_id", user.id).eq("portfolio_type", "paper_active")
      .eq("scoring_version", "ag-evidence-capture-v1").maybeSingle();
    if (error || !data || data.status !== "completed" || data.stage !== "ag_evidence_complete")
      return fail("AG_SEC_SOURCE_NOT_FOUND_OR_INCOMPLETE", 409);
    const raw = data.state as Record<string, unknown> | null;
    const e = raw?.evidence as Record<string, unknown> | undefined;
    if (raw?.version !== "ag-evidence-capture-v1" || raw?.cursor !== 1 ||
        !e || typeof e !== "object" || e.sourceKind !== "FMP_PROFILE_QUOTE_ANNUAL_INCOME" ||
        e.identityStatus !== "CONSISTENT_VENDOR_ONLY" || typeof e.symbol !== "string" ||
        e.symbol !== raw.symbol || typeof e.issuerName !== "string" ||
        typeof e.fiscalPeriodEnd !== "string" || typeof e.filedDate !== "string" ||
        typeof e.capturedAt !== "string")
      return fail("AG_SEC_SOURCE_EVIDENCE_INVALID", 409);
    const source: Source = {
      symbol: e.symbol, vendorIssuerName: e.issuerName,
      vendorFiscalEnd: e.fiscalPeriodEnd, vendorFilingDate: e.filedDate,
      vendorCaptureTime: e.capturedAt,
    };
    const { data: created, error: insertError } = await db.from("discovery_scan_runs").insert({
      user_id: user.id, portfolio_type: "paper_active", scoring_version: SEC_VERIFY_VERSION,
      status: "running", stage: "ag_sec_ready", prescreen_count: 1,
      state: { version: SEC_VERIFY_VERSION, sourceScanId: data.id, source, verification: null },
    }).select("id,status,stage,state,created_at").single();
    if (insertError || !created) return fail("AG_SEC_ACTIVE_OR_UNAVAILABLE", 409);
    return NextResponse.json(present(created as Row), { headers });
  }
  if (body.action !== "verify" || !uuid(body.id)) return fail("AG_SEC_INVALID_ACTION", 400);
  let row: Row | null;
  try { row = await load(db, user.id, body.id); }
  catch { return fail("AG_SEC_READ_FAILED", 500); }
  if (!row) return fail("AG_SEC_NOT_FOUND", 404);
  if (row.status === "completed" && row.stage === "ag_sec_complete")
    return NextResponse.json(present(row), { headers });
  if (row.status !== "running" || row.stage !== "ag_sec_ready")
    return fail("AG_SEC_REQUIRES_RECONCILIATION", 409);
  let state: State;
  try { state = parseState(row.state); if (state.verification !== null) throw new Error("BAD_STATE"); }
  catch { return fail("AG_SEC_STATE_INVALID", 409); }
  const { data: claim, error: claimError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_sec_claimed" }).eq("id", row.id).eq("user_id", user.id)
    .eq("portfolio_type", "paper_active").eq("scoring_version", SEC_VERIFY_VERSION)
    .eq("status", "running").eq("stage", "ag_sec_ready")
    .select("id").maybeSingle();
  if (claimError || !claim) return fail("AG_SEC_CONCURRENT_CHANGE", 409);
  let verification: SecEvidence;
  try { verification = await verifyAgSecIssuer(state.source); }
  catch { return fail("AG_SEC_PROVIDER_OR_RECONCILIATION_FAILED", 409); }
  const { data: saved, error: savedError } = await db.from("discovery_scan_runs")
    .update({ state: { ...state, verification }, status: "completed",
      stage: "ag_sec_complete", completed_count: 1, completed_at: new Date().toISOString() })
    .eq("id", row.id).eq("user_id", user.id).eq("portfolio_type", "paper_active")
    .eq("scoring_version", SEC_VERIFY_VERSION).eq("status", "running").eq("stage", "ag_sec_claimed")
    .select("id,status,stage,state,created_at").maybeSingle();
  if (savedError || !saved) return fail("AG_SEC_PERSISTENCE_UNCONFIRMED", 409);
  return NextResponse.json(present(saved as Row), { headers });
}
