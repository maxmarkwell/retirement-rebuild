import { NextRequest, NextResponse } from "next/server";
import { executeAgPaperBuy } from "@/lib/discovery/accelerated-growth/paper-execution";

export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG authorized execution test is disabled in production." }, { status: 404 });
  }
  try {
    const body = await request.json();
    const decisionId = String(body?.decisionId ?? "");
    if (!decisionId) return NextResponse.json({ error: "decisionId is required." }, { status: 400 });

    const result = await executeAgPaperBuy({ decisionId });
    return NextResponse.json({
      authorizedExecutionTest: true,
      executed: true,
      decisionId: result.decisionId,
      transactionId: result.transactionId,
      authorizationId: result.authorizationId,
      ticker: result.ticker,
      quantity: result.quantity,
      price: result.price,
      grossAmount: result.grossAmount,
      sizing: {
        eligible: result.sizing.eligible,
        action: result.sizing.action,
        targetNotional: result.sizing.targetNotional,
        version: result.sizing.version,
      },
      guardrails: {
        buyAllowed: result.guardrails.buyAllowed,
        version: result.guardrails.version,
      },
    });
  } catch (error) {
    return NextResponse.json(
      { authorizedExecutionTest: false, executed: false, error: error instanceof Error ? error.message : "Unknown authorized execution error." },
      { status: 400 },
    );
  }
}
