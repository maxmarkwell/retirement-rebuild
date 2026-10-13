import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgValuationSnapshot } from "@/lib/discovery/accelerated-growth/valuation-snapshot";
import { runAgCommittee } from "@/lib/discovery/accelerated-growth/committee";
import { auditValuationNarrative } from "@/lib/discovery/accelerated-growth/valuation-narrative-audit";
import type { AgDeepResearch } from "@/lib/discovery/accelerated-growth/deep-research";
export const dynamic = "force-dynamic";
export const maxDuration = 300;


// Research-only Committee preview; does not create investment decisions.
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
    .select("id").eq("user_id", user.id).eq("type", "paper_active").maybeSingle();
  if (portfolioError || !portfolio) {
    return NextResponse.json({ error: "An accessible AG paper portfolio is required." }, { status: 403 });
  }
  const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
    .select("id").eq("portfolio_id", portfolio.id).eq("user_id", user.id)
    .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
    .is("ended_at", null).maybeSingle();
  if (eraError || !era) {
    return NextResponse.json({ error: "An open AG paper strategy era is required." }, { status: 403 });
  }


  try {
    const body = await request.json() as { research?: AgDeepResearch };
    const research = body?.research;
    if (!research || !/^[A-Z][A-Z0-9.-]{0,9}$/.test(research.symbol ?? "") || research.researchStatus !== "PROCEED" || !["ag-deep-research-v1", "ag-deep-research-v2"].includes(research.promptVersion ?? "") || !research.thesis?.trim() || !Array.isArray(research.evidenceAgainst) || !Array.isArray(research.invalidation)) return NextResponse.json({ error: "A valid PROCEED deep research result is required." }, { status: 400 });
    const valuation = await getAgValuationSnapshot(research.symbol).catch((error) => {
      console.warn("AG valuation snapshot unavailable", error instanceof Error ? error.message : String(error));
      return null;
    });
    const decision = await runAgCommittee(research, valuation);
    const valuationNarrativeAudit = auditValuationNarrative(decision.valuationEvidence, valuation ? { vendorMarketCap: valuation.valuationComparison.vendor.marketCap, vendorEnterpriseValue: valuation.valuationComparison.vendor.enterpriseValue, secMarketCap: valuation.valuationComparison.secShareDiagnostic.marketCap, secEnterpriseValue: valuation.valuationComparison.secShareDiagnostic.enterpriseValue, vendorPriceToSales: valuation.valuationComparison.vendor.priceToSales, vendorPriceToEarnings: valuation.valuationComparison.vendor.priceToEarnings, vendorEvToSales: valuation.valuationComparison.vendor.evToSales, secPriceToSales: valuation.valuationComparison.secShareDiagnostic.priceToSales, secPriceToEarnings: valuation.valuationComparison.secShareDiagnostic.priceToEarnings, secEvToSales: valuation.valuationComparison.secShareDiagnostic.evToSales } : null);
    return NextResponse.json({ version: "ag-committee-preview-v1", mode: "read_only", executionEnabled: false, decisionsPersisted: false, transactionsWritten: false, valuationSnapshot: valuation, decision, valuationNarrativeAudit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG committee preview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Committee preview failed." }, { status: 500 });
  }
}
