import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG RPC trust-boundary test is disabled in production." }, { status: 404 });
  }
  try {
    const body = await request.json();
    const decisionId = String(body?.decisionId ?? "");
    if (!decisionId) return NextResponse.json({ error: "decisionId is required." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: before, error: beforeError } = await supabase.from("investment_decisions")
      .select("id,portfolio_id,ticker,source,decision_type,status,transaction_id")
      .eq("id", decisionId).eq("user_id", user.id).single();
    if (beforeError || !before) throw new Error("Fixture decision not found.");
    if (before.ticker !== "AGFIX" || before.source !== "ai_committee" || before.decision_type !== "buy") {
      throw new Error("Trust-boundary endpoint only accepts the synthetic AGFIX Committee BUY fixture.");
    }
    if (before.status !== "active" || before.transaction_id) throw new Error("AGFIX fixture must be active and unexecuted.");

    // Attack 1: authenticated user tries the retired caller-supplied-price RPC.
    const { error: legacyRpcError } = await supabase.rpc("execute_ag_paper_buy_atomic", {
      p_decision_id: decisionId, p_quantity: 0.1, p_price: 50, p_gross_amount: 5.0,
      p_notes: "AG trust-boundary forged-price attack",
    });

    // Attack 2: authenticated user tries to consume the service-only authorized RPC.
    // A random UUID is sufficient: permission denial must happen before authorization lookup.
    const { error: authorizedRpcError } = await supabase.rpc("execute_ag_paper_buy_authorized", {
      p_authorization_id: "00000000-0000-0000-0000-000000000001",
    });

    // Attack 3: authenticated user tries to mint an authorization row directly.
    const { error: mintError } = await supabase.from("ag_execution_authorizations").insert({
      user_id: user.id, portfolio_id: before.portfolio_id, decision_id: decisionId,
      ticker: "AGFIX", quantity: 0.1, price: 50, gross_amount: 5,
      expires_at: new Date(Date.now() + 60_000).toISOString(),
    });

    const { data: after, error: afterError } = await supabase.from("investment_decisions")
      .select("id,status,transaction_id").eq("id", decisionId).eq("user_id", user.id).single();
    if (afterError || !after) throw new Error("Unable to verify fixture decision after trust-boundary attacks.");

    const { data: fixtureTransactions, error: txError } = await supabase.from("transactions")
      .select("id,ticker,quantity,price_per_share,gross_amount,created_at")
      .eq("portfolio_id", before.portfolio_id).eq("ticker", "AGFIX");
    if (txError) throw txError;

    const results = [
      { name: "authenticated_forged_price_rpc", blocked: Boolean(legacyRpcError), error: legacyRpcError?.message ?? null },
      { name: "authenticated_authorized_rpc", blocked: Boolean(authorizedRpcError), error: authorizedRpcError?.message ?? null },
      { name: "authenticated_mint_authorization", blocked: Boolean(mintError), error: mintError?.message ?? null },
    ];
    const allBlocked = results.every((r) => r.blocked);
    const ledgerClean = after.status === "active" && !after.transaction_id && (fixtureTransactions ?? []).length === 0;

    return NextResponse.json({
      trustBoundaryTest: true, decisionId, allBlocked, ledgerClean, passed: allBlocked && ledgerClean,
      results, after, fixtureTransactionCount: (fixtureTransactions ?? []).length,
      fixtureTransactions: fixtureTransactions ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { trustBoundaryTest: false, error: error instanceof Error ? error.message : "Unknown trust-boundary test error." },
      { status: 400 },
    );
  }
}
