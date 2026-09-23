import { NextResponse } from "next/server";
import { getAgHoldingDecisionLifecycleAction } from "@/lib/discovery/accelerated-growth/holding-review-pipeline";
import { executeAgDailyCycleSells } from "@/lib/discovery/accelerated-growth/daily-cycle-execution";

export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG holding lifecycle diagnostic is disabled in production." }, { status: 404 });
  }

  const cases = [
    { name: "sameHold", existing: "hold", next: "HOLD" as const, expected: "REUSE" },
    { name: "sameSell", existing: "sell", next: "SELL" as const, expected: "REUSE" },
    { name: "holdToSell", existing: "hold", next: "SELL" as const, expected: "INSERT_SUPERSEDING" },
    { name: "sellToHold", existing: "sell", next: "HOLD" as const, expected: "INSERT_SUPERSEDING" },
    { name: "buyToHold", existing: "buy", next: "HOLD" as const, expected: "INSERT_SUPERSEDING" },
    { name: "noPriorSell", existing: null, next: "SELL" as const, expected: "INSERT_SUPERSEDING" },
  ].map((test) => {
    const actual = getAgHoldingDecisionLifecycleAction({ existingActiveDecisionType: test.existing, nextDecision: test.next });
    return { ...test, actual, passed: actual === test.expected };
  });

  const executionGate = await executeAgDailyCycleSells({
    enabled: false,
    decisions: [{ decisionId: "diagnostic-never-execute", symbol: "ZZAGSELL", decision: "SELL", reused: false }],
  });

  const checks = {
    lifecycleCasesPassed: cases.every((test) => test.passed),
    disabledGateRecognizedSell: executionGate.sellDecisionCount === 1,
    disabledGateExecutedNothing: executionGate.executedSellCount === 0 && executionGate.sells.length === 0,
    disabledGateRemainedDisabled: executionGate.enabled === false,
  };

  return NextResponse.json({
    agHoldingReviewLifecycleDiagnostic: true,
    zeroAI: true,
    zeroWrite: true,
    zeroExecution: true,
    cases,
    executionGate,
    checks,
    passed: Object.values(checks).every(Boolean),
  });
}
