import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  AG_UNIVERSE_FILTERS, AG_UNIVERSE_SOURCE, collectAgUniverse,
} from "@/lib/discovery/accelerated-growth/universe-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const fail = (code: string, status: number) =>
  NextResponse.json({
    error: code, executionEnabled: false, transactionsWritten: false,
  }, { status, headers });

export async function GET(req: NextRequest) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return fail("AUTH_REQUIRED", 401);
  const pagesRaw = req.nextUrl.searchParams.get("pages") ?? "2";
  if (!/^[1-4]$/.test(pagesRaw) || req.nextUrl.searchParams.size > 1)
    return fail("AG_UNIVERSE_INVALID_PAGES", 400);
  const key = process.env.FMP_API_KEY;
  if (!key) return fail("AG_UNIVERSE_PROVIDER_NOT_CONFIGURED", 503);
  try {
    const snapshot = await collectAgUniverse(async (page,limit) => {
      const url = new URL(AG_UNIVERSE_SOURCE);
      for (const [name,value] of Object.entries(AG_UNIVERSE_FILTERS))
        url.searchParams.set(name,value);
      url.searchParams.set("page",String(page));
      url.searchParams.set("limit",String(limit));
      url.searchParams.set("apikey",key);
      const response = await fetch(url, {
        cache: "no-store", signal: AbortSignal.timeout(16000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("AG_UNIVERSE_PROVIDER_UNAVAILABLE");
      return response.json();
    }, {
      maxPages:Number(pagesRaw), pageSize:250,
      startedAt:new Date().toISOString(),
      finishedAt:()=>new Date().toISOString(),
    });
    return NextResponse.json({
      ...snapshot,
      executionEnabled:false,transactionsWritten:false,
      // GET remains read-only: no saved research scans or execution workflows.
      persisted:false,
    }, { headers });
  } catch {
    return fail("AG_UNIVERSE_PROVIDER_OR_COVERAGE_FAILED", 503);
  }
}
