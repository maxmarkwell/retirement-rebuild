import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getAgValuationSnapshot } from "@/lib/discovery/accelerated-growth/valuation-snapshot";
import { runAgCommittee } from "@/lib/discovery/accelerated-growth/committee";
import type { AgDeepResearch } from "@/lib/discovery/accelerated-growth/deep-research";
export const dynamic = "force-dynamic";
export const maxDuration = 300;


function auditValuationNarrative(text: string, valuation: Awaited<ReturnType<typeof getAgValuationSnapshot>> | null) {
  const findings: string[] = [];
  let checked = 0;
  if (!valuation) return { version: "ag-narrative-audit-v1", status: "NOT_EVALUATED", checked, findings: ["Valuation unavailable"] };
  // Require an unambiguous vendor/SEC basis and metric within the same clause.
  const clauses = text.split(/[;\n]|(?<=[.!?])\s+/);
  for (const clause of clauses) {
    const lower = clause.toLowerCase();
    const sec = /sec[- ](?:share|derived|based|diagnostic)/.test(lower);
    const vendor = /\b(?:fmp|vendor)\b/.test(lower);
    if (sec === vendor) continue;
    const metrics = [
      { label: "market capitalization", test: /market cap(?:italization)?/, value: sec ? valuation.valuationComparison.secShareDiagnostic.marketCap : valuation.valuationComparison.vendor.marketCap },
      { label: "enterprise value", test: /enterprise value/, value: sec ? valuation.valuationComparison.secShareDiagnostic.enterpriseValue : valuation.valuationComparison.vendor.enterpriseValue },
    ];
    const present = metrics.filter(m => m.test.test(lower));
    if (present.length !== 1 || present[0].value == null) continue;
    const amounts = [...clause.matchAll(/\$\s*([\d,]+(?:\.\d+)?)\s*(trillion|billion|million)\b/gi)];
    if (amounts.length !== 1) continue;
    const amount = Number(amounts[0][1].replace(/,/g, "")) * ({ trillion: 1e12, billion: 1e9, million: 1e6 }[amounts[0][2].toLowerCase() as "trillion" | "billion" | "million"]);
    checked++;
    const expected = present[0].value as number;
    if (!Number.isFinite(amount) || Math.abs(amount - expected) / expected > 0.05)
      findings.push(`${sec ? "SEC" : "vendor"} ${present[0].label}: ${amounts[0][0]} differs from snapshot by over 5% (possible unit error).`);
  }
  return { version: "ag-narrative-audit-v1", status: findings.length ? "FLAGGED" : checked ? "PASS" : "NOT_EVALUATED", checked, findings };
}

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
    const valuationNarrativeAudit = auditValuationNarrative(decision.valuationEvidence, valuation);
    return NextResponse.json({ version: "ag-committee-preview-v1", mode: "read_only", executionEnabled: false, decisionsPersisted: false, transactionsWritten: false, valuationSnapshot: valuation, decision, valuationNarrativeAudit }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("AG committee preview failed", error);
    return NextResponse.json({ error: error instanceof Error ? error.message : "Committee preview failed." }, { status: 500 });
  }
}
