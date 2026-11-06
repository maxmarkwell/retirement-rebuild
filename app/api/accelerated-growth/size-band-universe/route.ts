import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  collectAgSizeBandUniverse,
} from "@/lib/discovery/accelerated-growth/size-band-universe";
import {
  AG_UNIVERSE_FILTERS, AG_UNIVERSE_SOURCE,
} from "@/lib/discovery/accelerated-growth/universe-intake";

export const dynamic = "force-dynamic";
export const maxDuration = 90;
const headers = { "Cache-Control": "no-store" };
const fail = (code: string, status: number) =>
  NextResponse.json({
    error: code, executionEnabled: false, transactionsWritten: false,
  }, { status, headers });

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data: { user }, error } = await db.auth.getUser();
  if (error || !user) return fail("AUTH_REQUIRED", 401);
  const pagesRaw = request.nextUrl.searchParams.get("pagesPerBand") ?? "1";
  if (!/^[12]$/.test(pagesRaw) || request.nextUrl.searchParams.size > 1)
    return fail("AG_BANDED_INVALID_SCOPE", 400);
  const key = process.env.FMP_API_KEY;
  if (!key) return fail("AG_BANDED_PROVIDER_NOT_CONFIGURED", 503);
  try {
    const snapshot = await collectAgSizeBandUniverse(async (band, page, limit) => {
      const url = new URL(AG_UNIVERSE_SOURCE);
      for (const [name,value] of Object.entries(AG_UNIVERSE_FILTERS))
        url.searchParams.set(name, value);
      url.searchParams.set("marketCapMoreThan", String(band.minExclusiveUsd));
      if (band.maxExclusiveUsd !== null)
        url.searchParams.set("marketCapLowerThan", String(band.maxExclusiveUsd));
      url.searchParams.set("page", String(page));
      url.searchParams.set("limit", String(limit));
      url.searchParams.set("apikey", key);
      const response = await fetch(url, {
        cache: "no-store", signal: AbortSignal.timeout(16000),
        headers: { Accept: "application/json" },
      });
      if (!response.ok) throw new Error("AG_BANDED_PROVIDER_UNAVAILABLE");
      return response.json();
    }, {
      pagesPerBand: Number(pagesRaw), pageSize: 250,
      startedAt: new Date().toISOString(),
      finishedAt: () => new Date().toISOString(),
    });
    return NextResponse.json({
      ...snapshot,
      persisted: false, executionEnabled: false, transactionsWritten: false,
    }, { headers });
  } catch {
    return fail("AG_BANDED_PROVIDER_OR_COVERAGE_FAILED", 503);
  }
}
