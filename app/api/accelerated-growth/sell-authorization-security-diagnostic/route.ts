import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

async function expectRpcFailure(admin: ReturnType<typeof createAdminClient>, authorizationId: string) {
  const { error } = await admin.rpc("execute_ag_paper_sell_authorized", { p_authorization_id: authorizationId });
  return Boolean(error);
}

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG SELL security diagnostic is disabled in production." }, { status: 404 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "You must be signed in." }, { status: 401 });

  const admin = createAdminClient();
  const cleanup = { transactionIds: [] as string[], decisionIds: [] as string[], authorizationIds: [] as string[] };

  try {
    const { data: portfolio, error: portfolioError } = await supabase.from("portfolios")
      .select("id").eq("user_id", user.id).eq("type", "paper_active").eq("is_real_money", false).single();
    if (portfolioError || !portfolio) throw new Error("paper_active portfolio is required for AG SELL diagnostic.");

    const { data: era, error: eraError } = await supabase.from("portfolio_strategy_eras")
      .select("id, inception_at").eq("user_id", user.id).eq("portfolio_id", portfolio.id)
      .eq("strategy_key", "accelerated_growth").eq("execution_mode", "paper").is("ended_at", null).single();
    if (eraError || !era) throw new Error("Open AG paper era is required for SELL diagnostic.");

    const ticker = "ZZAGSELL";
    const base = new Date(Math.max(Date.now() - 30_000, new Date(era.inception_at).getTime() + 1_000));

    const { data: buy, error: buyError } = await admin.from("transactions").insert({
      user_id: user.id, portfolio_id: portfolio.id, transaction_type: "buy", ticker,
      quantity: 2, price_per_share: 10, gross_amount: 20, fees: 1,
      transaction_date: base.toISOString(), created_at: base.toISOString(),
      notes: "AG SELL security diagnostic fixture BUY.",
    }).select("id").single();
    if (buyError || !buy) throw new Error(`Unable to create diagnostic BUY: ${buyError?.message ?? "unknown error"}`);
    cleanup.transactionIds.push(buy.id);

    const makeDecision = async (type: "buy" | "sell", status = "active") => {
      const { data, error } = await admin.from("investment_decisions").insert({
        user_id: user.id, portfolio_id: portfolio.id, decision_type: type, ticker,
        decision_date: new Date(base.getTime() + 1_000).toISOString(), decision_price: 12,
        recommended_quantity: 1, confidence_score: 80, risk_level: "high",
        thesis: "Diagnostic fixture only.", source: "ai_committee", status,
      }).select("id").single();
      if (error || !data) throw new Error(`Unable to create diagnostic ${type} decision: ${error?.message ?? "unknown error"}`);
      cleanup.decisionIds.push(data.id);
      return data.id as string;
    };

    const makeAuthorization = async (decisionId: string, quantity: number, expiresAt: string) => {
      const { data, error } = await admin.from("ag_sell_execution_authorizations").insert({
        user_id: user.id, portfolio_id: portfolio.id, strategy_era_id: era.id, decision_id: decisionId,
        ticker, quantity, price_per_share: 12, fees: 0, expires_at: expiresAt,
      }).select("id").single();
      if (error || !data) throw new Error(`Unable to create diagnostic authorization: ${error?.message ?? "unknown error"}`);
      cleanup.authorizationIds.push(data.id);
      return data.id as string;
    };

    const expiredDecision = await makeDecision("sell");
    const expiredAuth = await makeAuthorization(expiredDecision, 1, new Date(Date.now() - 1_000).toISOString());
    const expiredBlocked = await expectRpcFailure(admin, expiredAuth);

    const buyDecision = await makeDecision("buy");
    const buyAuth = await makeAuthorization(buyDecision, 1, new Date(Date.now() + 60_000).toISOString());
    const buyDecisionBlocked = await expectRpcFailure(admin, buyAuth);

    const oversellDecision = await makeDecision("sell");
    const oversellAuth = await makeAuthorization(oversellDecision, 3, new Date(Date.now() + 60_000).toISOString());
    const oversellBlocked = await expectRpcFailure(admin, oversellAuth);

    const validDecision = await makeDecision("sell");
    const validAuth = await makeAuthorization(validDecision, 1, new Date(Date.now() + 60_000).toISOString());
    const { data: successRows, error: successError } = await admin.rpc("execute_ag_paper_sell_authorized", { p_authorization_id: validAuth });
    if (successError) throw new Error(`Valid authorized SELL failed: ${successError.message}`);
    const success = Array.isArray(successRows) ? successRows[0] : successRows;
    if (success?.transaction_id) cleanup.transactionIds.push(success.transaction_id);

    const replayBlocked = await expectRpcFailure(admin, validAuth);

    // The authenticated browser role must not be able to mint authorizations or invoke the execution RPC.
    const { error: browserMintError } = await supabase.from("ag_sell_execution_authorizations").insert({
      user_id: user.id, portfolio_id: portfolio.id, strategy_era_id: era.id, decision_id: validDecision,
      ticker, quantity: 0.1, price_per_share: 12, fees: 0, expires_at: new Date(Date.now() + 60_000).toISOString(),
    });
    const browserMintBlocked = Boolean(browserMintError);
    const { error: browserRpcError } = await supabase.rpc("execute_ag_paper_sell_authorized", { p_authorization_id: validAuth });
    const browserRpcBlocked = Boolean(browserRpcError);

    const checks = {
      expiredBlocked,
      buyDecisionBlocked,
      oversellBlocked,
      validExecutionSucceeded: Boolean(success?.transaction_id),
      fifoCostBasis: Number(success?.cost_basis) === 10.5,
      realizedGainLoss: Number(success?.realized_gain_loss) === 1.5,
      sharesOwnedBefore: Number(success?.shares_owned_before) === 2,
      sharesOwnedAfter: Number(success?.shares_owned_after) === 1,
      replayBlocked,
      browserMintBlocked,
      browserRpcBlocked,
    };
    const passed = Object.values(checks).every(Boolean);

    for (const id of cleanup.authorizationIds) await admin.from("ag_sell_execution_authorizations").delete().eq("id", id);
    for (const id of cleanup.decisionIds) await admin.from("investment_decisions").delete().eq("id", id);
    for (const id of cleanup.transactionIds) await admin.from("transactions").delete().eq("id", id);

    return NextResponse.json({
      agSellAuthorizationSecurityDiagnostic: true,
      fixture: true,
      realPortfolioUntouched: true,
      ticker,
      checks,
      cleanedUp: true,
      passed,
    });
  } catch (error) {
    for (const id of cleanup.authorizationIds) await admin.from("ag_sell_execution_authorizations").delete().eq("id", id);
    for (const id of cleanup.decisionIds) await admin.from("investment_decisions").delete().eq("id", id);
    for (const id of cleanup.transactionIds) await admin.from("transactions").delete().eq("id", id);
    return NextResponse.json({
      agSellAuthorizationSecurityDiagnostic: true,
      fixture: true,
      realPortfolioUntouched: true,
      passed: false,
      error: error instanceof Error ? error.message : "AG SELL security diagnostic failed.",
    }, { status: 500 });
  }
}
