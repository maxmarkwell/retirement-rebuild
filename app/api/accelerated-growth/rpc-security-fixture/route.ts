import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { persistAgCommitteeDecisions } from "@/lib/discovery/accelerated-growth/committee-pipeline";
import type { AgCommitteeDecision } from "@/lib/discovery/accelerated-growth/committee";

export const dynamic = "force-dynamic";

const FIXTURE_SYMBOL = "AGFIX";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG RPC security fixture is disabled in production." }, { status: 404 });
  }

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: portfolio, error: portfolioError } = await supabase
      .from("portfolios").select("id").eq("user_id", user.id).eq("type", "paper_active").single();
    if (portfolioError || !portfolio) throw new Error("Accelerated Growth paper portfolio not found.");

    // Reuse any post-era AGFIX decision regardless of status so repeated test
    // clicks never manufacture multiple synthetic decisions.
    const { data: era, error: eraError } = await supabase
      .from("portfolio_strategy_eras").select("inception_at")
      .eq("portfolio_id", portfolio.id).eq("user_id", user.id)
      .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper")
      .is("ended_at", null).single();
    if (eraError || !era) throw new Error("Open Accelerated Growth paper era not found.");

    const { data: existing, error: existingError } = await supabase
      .from("investment_decisions")
      .select("id,decision_type,status,transaction_id,created_at")
      .eq("portfolio_id", portfolio.id).eq("user_id", user.id)
      .eq("ticker", FIXTURE_SYMBOL).eq("source", "ai_committee")
      .gte("created_at", era.inception_at)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      return NextResponse.json({
        fixture: true, reused: true, portfolioId: portfolio.id,
        decisionId: existing.id, ticker: FIXTURE_SYMBOL,
        decision: existing.decision_type.toUpperCase(),
        status: existing.status, transactionId: existing.transaction_id,
      });
    }

    const fixture: AgCommitteeDecision = {
      symbol: FIXTURE_SYMBOL,
      companyName: "Accelerated Growth Security Fixture",
      decision: "BUY",
      ownershipThesis: "Synthetic local-only BUY used exclusively to validate database execution invariants.",
      committeeRationale: "Security fixture; not investment research and not a real security recommendation.",
      strongestEvidence: ["Synthetic fixture only."],
      strongestCounterEvidence: ["Must never be treated as an investable security."],
      requiredMonitoring: ["Delete fixture after RPC hardening tests."],
      thesisClock: "Local security test only",
      invalidation: ["Any use outside local RPC security testing."],
      confidence: 100,
      model: "synthetic-security-fixture",
      promptVersion: "ag-rpc-security-fixture-v1",
    };

    const [persisted] = await persistAgCommitteeDecisions(portfolio.id, [fixture]);
    if (!persisted) throw new Error("Fixture decision was not persisted.");

    return NextResponse.json({
      fixture: true, reused: false, portfolioId: portfolio.id,
      decisionId: persisted.decisionId, ticker: persisted.symbol,
      decision: persisted.decision, status: "active", transactionId: null,
    });
  } catch (error) {
    return NextResponse.json(
      { fixture: false, error: error instanceof Error ? error.message : "Unknown fixture error." },
      { status: 400 },
    );
  }
}
