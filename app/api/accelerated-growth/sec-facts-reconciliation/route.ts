import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AG_SEC_FACTS_VERSION, captureSecCompanyFacts,
  type FactsInput, type FactsReconciliation,
} from "@/lib/discovery/accelerated-growth/sec-facts-reconciliation";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const uuid = (v: unknown): v is string => typeof v === "string" &&
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
const fail = (code: string, status: number) =>
  NextResponse.json({ error: code, executionEnabled: false, transactionsWritten: false },
    { status, headers });
type State = {
  version: typeof AG_SEC_FACTS_VERSION;
  sourceSecScanId: string;
  sourceVendorScanId: string;
  input: FactsInput;
  reconciliation: FactsReconciliation | null;
};
type Row = { id: string; status: string; stage: string; state: unknown; created_at: string };
type ObjectMap = Record<string, unknown>;
const record = (x: unknown): x is ObjectMap =>
  x !== null && typeof x === "object" && !Array.isArray(x);
const numOrNull = (x: unknown): x is number | null =>
  x === null || (typeof x === "number" && Number.isFinite(x));
function parseState(value: unknown): State {
  if (!record(value) || value.version !== AG_SEC_FACTS_VERSION ||
      !uuid(value.sourceSecScanId) || !uuid(value.sourceVendorScanId) ||
      !record(value.input) || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(String(value.input.symbol)) ||
      !/^\d{10}$/.test(String(value.input.cik)) ||
      !/^\d{10}-\d{2}-\d{6}$/.test(String(value.input.accessionNumber)) ||
      ![value.input.vendorRevenue,value.input.vendorOperatingIncome,value.input.vendorNetIncome].every(numOrNull) ||
      (value.reconciliation !== null && (!record(value.reconciliation) ||
        value.reconciliation.symbol !== value.input.symbol)))
    throw new Error("AG_SEC_FACTS_INVALID_STATE");
  return value as State;
}
function present(row: Row) {
  const state = parseState(row.state);
  return {
    scanRunId: row.id, version: AG_SEC_FACTS_VERSION,
    sourceSecScanId: state.sourceSecScanId, sourceVendorScanId: state.sourceVendorScanId,
    status: row.status, stage: row.stage, symbol: state.input.symbol,
    reconciliation: state.reconciliation,
    requiresReconciliation: row.stage === "ag_facts_claimed" ||
      state.reconciliation?.result === "NEEDS_REVIEW",
    executionEnabled: false, transactionsWritten: false,
    createdAt: row.created_at,
  };
}
async function session() {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  return error || !user ? null : { db, user };
}
type DB = NonNullable<Awaited<ReturnType<typeof session>>>["db"];
async function getRun(db: DB, userId: string, id: string, version: string) {
  const { data, error } = await db.from("discovery_scan_runs")
    .select("id,status,stage,state,created_at").eq("id", id).eq("user_id", userId)
    .eq("portfolio_type", "paper_active").eq("scoring_version", version).maybeSingle();
  if (error) throw new Error("AG_SEC_FACTS_DB_READ_UNAVAILABLE");
  return data as Row | null;
}
export async function GET(request: NextRequest) {
  const auth = await session();
  if (!auth) return fail("AUTH_REQUIRED", 401);
  const id = request.nextUrl.searchParams.get("id");
  if (!uuid(id)) return fail("AG_SEC_FACTS_INVALID_ID", 400);
  try {
    const row = await getRun(auth.db, auth.user.id, id, AG_SEC_FACTS_VERSION);
    if (!row) return fail("AG_SEC_FACTS_NOT_FOUND", 404);
    return NextResponse.json(present(row), { headers });
  } catch { return fail("AG_SEC_FACTS_READ_FAILED", 500); }
}
export async function POST(request: NextRequest) {
  const auth = await session();
  if (!auth) return fail("AUTH_REQUIRED", 401);
  let body: { action?: unknown; sourceSecScanId?: unknown; id?: unknown };
  try { body = await request.json(); }
  catch { return fail("AG_SEC_FACTS_INVALID_REQUEST", 400); }
  if (!body || typeof body !== "object") return fail("AG_SEC_FACTS_INVALID_REQUEST", 400);
  const { db, user } = auth;
  if (body.action === "start") {
    if (!uuid(body.sourceSecScanId)) return fail("AG_SEC_FACTS_INVALID_SOURCE", 400);
    let sec: Row | null;
    try { sec = await getRun(db, user.id, body.sourceSecScanId, "ag-sec-issuer-v1"); }
    catch { return fail("AG_SEC_FACTS_SOURCE_UNAVAILABLE", 503); }
    if (!sec || sec.status !== "completed" || sec.stage !== "ag_sec_complete" ||
        !record(sec.state)) return fail("AG_SEC_FACTS_SEC_SOURCE_INCOMPLETE", 409);
    const s = sec.state;
    if (s.version !== "ag-sec-issuer-v1" || !uuid(s.sourceScanId) ||
        !record(s.verification) || !record(s.source))
      return fail("AG_SEC_FACTS_SEC_SOURCE_INVALID", 409);
    const v = s.verification, ss = s.source;
    if (v.verification !== "SEC_ISSUER_AND_FILING_METADATA_MATCH" ||
        v.symbol !== ss.symbol || v.form !== "10-K" ||
        v.filingDate !== ss.vendorFilingDate || v.reportDate !== ss.vendorFiscalEnd ||
        !/^\d{10}$/.test(String(v.cik)) ||
        !/^\d{10}-\d{2}-\d{6}$/.test(String(v.accessionNumber)))
      return fail("AG_SEC_FACTS_SEC_SOURCE_CONFLICT", 409);
    let vendor: Row | null;
    try { vendor = await getRun(db, user.id, s.sourceScanId, "ag-evidence-capture-v1"); }
    catch { return fail("AG_SEC_FACTS_VENDOR_SOURCE_UNAVAILABLE", 503); }
    if (!vendor || vendor.status !== "completed" || vendor.stage !== "ag_evidence_complete" ||
        !record(vendor.state) || !record(vendor.state.evidence) ||
        vendor.state.version !== "ag-evidence-capture-v1" || vendor.state.cursor !== 1)
      return fail("AG_SEC_FACTS_VENDOR_SOURCE_INCOMPLETE", 409);
    const e = vendor.state.evidence;
    if (e.symbol !== v.symbol || e.issuerName !== ss.vendorIssuerName ||
        e.fiscalPeriodEnd !== v.reportDate || e.filedDate !== v.filingDate ||
        e.capturedAt !== ss.vendorCaptureTime ||
        e.sourceKind !== "FMP_PROFILE_QUOTE_ANNUAL_INCOME" ||
        e.identityStatus !== "CONSISTENT_VENDOR_ONLY" ||
        typeof e.revenue !== "number" || !Number.isFinite(e.revenue) ||
        ![e.operatingIncome,e.netIncome].every(numOrNull))
      return fail("AG_SEC_FACTS_VENDOR_SOURCE_CONFLICT", 409);
    const input: FactsInput = {
      symbol: String(v.symbol), cik: String(v.cik),
      accessionNumber: String(v.accessionNumber),
      filedDate: String(v.filingDate), fiscalEnd: String(v.reportDate),
      vendorRevenue: e.revenue, vendorOperatingIncome: e.operatingIncome as number | null,
      vendorNetIncome: e.netIncome as number | null,
    };
    const { data: created, error: insertError } = await db.from("discovery_scan_runs").insert({
      user_id: user.id, portfolio_type: "paper_active", scoring_version: AG_SEC_FACTS_VERSION,
      status: "running", stage: "ag_facts_ready", prescreen_count: 1,
      state: {
        version: AG_SEC_FACTS_VERSION, sourceSecScanId: sec.id,
        sourceVendorScanId: vendor.id, input, reconciliation: null,
      },
    }).select("id,status,stage,state,created_at").single();
    if (insertError || !created) return fail("AG_SEC_FACTS_ACTIVE_OR_UNAVAILABLE", 409);
    return NextResponse.json(present(created as Row), { headers });
  }
  if (body.action !== "reconcile" || !uuid(body.id))
    return fail("AG_SEC_FACTS_INVALID_ACTION", 400);
  let row: Row | null;
  try { row = await getRun(db, user.id, body.id, AG_SEC_FACTS_VERSION); }
  catch { return fail("AG_SEC_FACTS_READ_FAILED", 503); }
  if (!row) return fail("AG_SEC_FACTS_NOT_FOUND", 404);
  if (row.status === "completed" && row.stage === "ag_facts_complete")
    return NextResponse.json(present(row), { headers });
  if (row.status !== "running" || row.stage !== "ag_facts_ready")
    return fail("AG_SEC_FACTS_REQUIRES_RECONCILIATION", 409);
  let state: State;
  try {
    state = parseState(row.state);
    if (state.reconciliation !== null) throw new Error("INVALID_CURSOR");
  } catch { return fail("AG_SEC_FACTS_STATE_INVALID", 409); }
  const { data: claimed, error: claimError } = await db.from("discovery_scan_runs")
    .update({ stage: "ag_facts_claimed" }).eq("id", row.id).eq("user_id", user.id)
    .eq("portfolio_type", "paper_active").eq("scoring_version", AG_SEC_FACTS_VERSION)
    .eq("status", "running").eq("stage", "ag_facts_ready").select("id").maybeSingle();
  if (claimError || !claimed) return fail("AG_SEC_FACTS_CONCURRENT_CHANGE", 409);
  let reconciliation: FactsReconciliation;
  try { reconciliation = await captureSecCompanyFacts(state.input); }
  catch { return fail("AG_SEC_FACTS_PROVIDER_OR_VALIDATION_FAILED", 409); }
  const { data: saved, error: saveError } = await db.from("discovery_scan_runs")
    .update({ state: { ...state, reconciliation }, status: "completed",
      stage: "ag_facts_complete", completed_count: 1, completed_at: new Date().toISOString() })
    .eq("id", row.id).eq("user_id", user.id).eq("portfolio_type", "paper_active")
    .eq("scoring_version", AG_SEC_FACTS_VERSION).eq("status", "running")
    .eq("stage", "ag_facts_claimed")
    .select("id,status,stage,state,created_at").maybeSingle();
  if (saveError || !saved) return fail("AG_SEC_FACTS_SAVE_UNCONFIRMED", 409);
  return NextResponse.json(present(saved as Row), { headers });
}
