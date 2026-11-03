import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getOpenAIClient } from "@/lib/ai/client";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Authenticated, explicit probe. Never writes to Supabase or starts an AG cycle.
// Do not return credentials, vendor response bodies, or internal exception text.
export async function POST() {
  const noStore = { "Cache-Control": "no-store" };
  try {
    const db = await createClient();
    const { data: { user }, error: authError } = await db.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "AUTH_REQUIRED" }, { status: 401, headers: noStore });
    }

    const checkedAt = new Date().toISOString();
    type Check = { status: "pass" | "fail" | "not_configured"; code: string };
    const checks: Record<string, Check> = {};

    // The client must read, never insert/update/delete, and must stay user scoped.
    try {
      const { error } = await db.from("discovery_scan_runs")
        .select("id").eq("user_id", user.id).limit(1);
      checks.supabase = error
        ? { status: "fail", code: "USER_SCOPED_READ_FAILED" }
        : { status: "pass", code: "USER_SCOPED_READ_OK" };
    } catch {
      checks.supabase = { status: "fail", code: "SUPABASE_REQUEST_FAILED" };
    }

    if (!process.env.FMP_API_KEY) {
      checks.marketData = { status: "not_configured", code: "FMP_KEY_MISSING" };
    } else {
      try {
        const url = new URL("https://financialmodelingprep.com/stable/quote");
        url.searchParams.set("symbol", "MSFT");
        url.searchParams.set("apikey", process.env.FMP_API_KEY);
        const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(12000) });
        if (!response.ok) {
          checks.marketData = { status: "fail", code: "FMP_REQUEST_FAILED" };
        } else {
          const data: unknown = await response.json();
          const quote = Array.isArray(data) ? data[0] as { symbol?: unknown; price?: unknown } | undefined : undefined;
          checks.marketData = quote?.symbol === "MSFT" &&
            typeof quote.price === "number" && Number.isFinite(quote.price) && quote.price > 0
            ? { status: "pass", code: "MSFT_QUOTE_VALID" }
            : { status: "fail", code: "FMP_QUOTE_INVALID" };
        }
      } catch {
        checks.marketData = { status: "fail", code: "FMP_REQUEST_FAILED" };
      }
    }

    if (!process.env.OPENAI_API_KEY) {
      checks.ai = { status: "not_configured", code: "OPENAI_KEY_MISSING" };
    } else {
      try {
        const response = await getOpenAIClient().responses.create({
          model: "gpt-5.6-terra",
          input: "Return exactly the single word READY.",
          max_output_tokens: 32,
        }, { timeout: 20000, maxRetries: 0 });
        checks.ai = response.status === "completed" && typeof response.output_text === "string" &&
          response.output_text.trim().toUpperCase() === "READY"
          ? { status: "pass", code: "AI_RESPONSE_VALID" }
          : { status: "fail", code: "AI_RESPONSE_UNEXPECTED" };
      } catch {
        checks.ai = { status: "fail", code: "AI_REQUEST_FAILED" };
      }
    }

    // This check declares the deliberate isolation of THIS endpoint, not a
    // security attestation covering all other application routes.
    checks.diagnosticIsolation = { status: "pass", code: "READ_ONLY_NO_EXECUTION_PATH" };
    const overall = Object.values(checks).every(c => c.status === "pass") ? "pass" : "fail";
    return NextResponse.json({
      version: "ag-production-diagnostic-v1",
      checkedAt,
      environment: process.env.VERCEL_ENV ?? "unknown",
      deploymentCommit: process.env.VERCEL_GIT_COMMIT_SHA ?? null,
      overall,
      checks,
      executionEnabled: false,
      transactionsWritten: false,
    }, { status: overall === "pass" ? 200 : 503, headers: noStore });
  } catch {
    return NextResponse.json({ error: "DIAGNOSTIC_FAILED", executionEnabled: false },
      { status: 500, headers: noStore });
  }
}
