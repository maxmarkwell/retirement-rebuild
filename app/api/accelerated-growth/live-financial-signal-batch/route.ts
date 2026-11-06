import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  fetchFmpVendorAnnualBundle, inspectLiveAnnualVendorBatch,
} from "@/lib/discovery/accelerated-growth/live-financial-signal-batch";

export const dynamic="force-dynamic";
export const maxDuration=90;
const headers={"Cache-Control":"no-store"};
const fail=(error:string,status:number)=>NextResponse.json({
  error, executionEnabled:false,transactionsWritten:false,
}, {status,headers});
export async function POST(request:NextRequest) {
  const db=await createClient();
  const {data:{user},error}=await db.auth.getUser();
  if (error||!user) return fail("AUTH_REQUIRED",401);
  const origin=request.headers.get("origin");
  // Browser endpoint is deliberately restricted to same-origin POST.
  if (!origin || origin!==new URL(request.url).origin)
    return fail("AG_BATCH_ORIGIN_INVALID",403);
  let body:unknown;
  try {body=await request.json();} catch {return fail("AG_BATCH_INVALID_BODY",400);}
  if (!body||typeof body!=="object"||Array.isArray(body))
    return fail("AG_BATCH_INVALID_BODY",400);
  const proposed=(body as Record<string,unknown>).symbols;
  if (!Array.isArray(proposed)||proposed.length<1||proposed.length>6 ||
      proposed.some(s=>typeof s!=="string"||!/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) ||
      new Set(proposed).size!==proposed.length)
    return fail("AG_BATCH_SYMBOL_LIST_INVALID",400);
  if (!process.env.FMP_API_KEY) return fail("AG_BATCH_PROVIDER_NOT_CONFIGURED",503);
  const capturedAt=new Date().toISOString();
  const symbols=proposed as string[];
  const collected:Record<string,{income:unknown;cash:unknown}|null>={};
  // Deliberately sequential, capped at 6 issuer bundles / 12 requests.
  for(const symbol of symbols) collected[symbol]=await fetchFmpVendorAnnualBundle(symbol);
  try {
    const result=inspectLiveAnnualVendorBatch(
      symbols,capturedAt.slice(0,10),capturedAt,collected,
    );
    return NextResponse.json({...result,persisted:false},{headers});
  }catch {
    return fail("AG_BATCH_EVIDENCE_RECONCILIATION_FAILED",409);
  }
}
