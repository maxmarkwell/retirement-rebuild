import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Attack = { name: string; quantity: number; price: number; gross: number };

const attacks: Attack[] = [
  { name: "quantity_precision", quantity: 0.1234, price: 50, gross: 6.17 },
  { name: "forged_gross", quantity: 0.1, price: 50, gross: 9.99 },
  { name: "below_minimum", quantity: 0.08, price: 50, gross: 4.00 },
  // Valid precision and internally consistent gross, but deliberately larger
  // than the deterministic fresh-starter size. This must now fail before any write.
  { name: "deterministic_starter_bypass", quantity: 0.18, price: 50, gross: 9.00 },
  { name: "position_cap", quantity: 0.22, price: 50, gross: 11.00 },
  { name: "sleeve_cap", quantity: 1.0, price: 50, gross: 50.00 },
];

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG RPC adversarial test is disabled in production." }, { status: 404 });
  }
  try {
    const body = await request.json();
    const decisionId = String(body?.decisionId ?? "");
    if (!decisionId) return NextResponse.json({ error: "decisionId is required." }, { status: 400 });

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

    const { data: before, error: beforeError } = await supabase
      .from("investment_decisions").select("id,portfolio_id,ticker,source,decision_type,status,transaction_id")
      .eq("id", decisionId).eq("user_id", user.id).single();
    if (beforeError || !before) throw new Error("Fixture decision not found.");
    if (before.ticker !== "AGFIX" || before.source !== "ai_committee" || before.decision_type !== "buy") {
      throw new Error("Adversarial endpoint only accepts the synthetic AGFIX Committee BUY fixture.");
    }
    if (before.status !== "active" || before.transaction_id) {
      throw new Error("AGFIX fixture must be active and unexecuted before adversarial testing.");
    }

    const results: Array<{ name: string; blocked: boolean; error: string | null }> = [];
    for (const attack of attacks) {
      const { error } = await supabase.rpc("execute_ag_paper_buy_atomic", {
        p_decision_id: decisionId, p_quantity: attack.quantity, p_price: attack.price,
        p_gross_amount: attack.gross, p_notes: `AG RPC adversarial test: ${attack.name}`,
      });
      results.push({ name: attack.name, blocked: Boolean(error), error: error?.message ?? null });
      if (!error) break;
    }

    const { data: after, error: afterError } = await supabase
      .from("investment_decisions").select("id,status,transaction_id")
      .eq("id", decisionId).eq("user_id", user.id).single();
    if (afterError || !after) throw new Error("Unable to verify fixture decision after attacks.");

    const { data: fixtureTransactions, error: txError } = await supabase
      .from("transactions").select("id,ticker,quantity,price_per_share,gross_amount,created_at")
      .eq("portfolio_id", before.portfolio_id).eq("ticker", "AGFIX");
    if (txError) throw txError;

    const allBlocked = results.length === attacks.length && results.every((r) => r.blocked);
    const ledgerClean = after.status === "active" && !after.transaction_id && (fixtureTransactions ?? []).length === 0;

    return NextResponse.json({
      adversarialTest: true, decisionId, allBlocked, ledgerClean, passed: allBlocked && ledgerClean,
      results, after, fixtureTransactionCount: (fixtureTransactions ?? []).length,
      fixtureTransactions: fixtureTransactions ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { adversarialTest: false, error: error instanceof Error ? error.message : "Unknown adversarial test error." },
      { status: 400 },
    );
  }
}
