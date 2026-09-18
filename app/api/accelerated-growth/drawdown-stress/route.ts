import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const thresholds = [10, 15, 20, 25] as const;
const sleeveCapital = 40;
const positionScenarios = [
  { name: "one_position_down_20", losses: [-2, 0, 0, 0] },
  { name: "two_positions_down_20", losses: [-2, -2, 0, 0] },
  { name: "one_position_down_40", losses: [-4, 0, 0, 0] },
  { name: "mixed_moderate", losses: [-1.5, -1.25, -0.75, -0.5] },
  { name: "broad_15_percent", losses: [-1.5, -1.5, -1.5, -1.5] },
  { name: "broad_20_percent", losses: [-2, -2, -2, -2] },
  { name: "broad_25_percent", losses: [-2.5, -2.5, -2.5, -2.5] },
] as const;

export async function GET() {
  if (process.env.NODE_ENV === "production") return new NextResponse("Not found", { status: 404 });

  const scenarios = positionScenarios.map((scenario) => {
    const dollarLoss = Math.abs(scenario.losses.reduce((sum, loss) => sum + loss, 0));
    const drawdownPct = Number(((dollarLoss / sleeveCapital) * 100).toFixed(2));
    return {
      name: scenario.name,
      positionLosses: scenario.losses,
      dollarLoss,
      drawdownPct,
      thresholdResults: thresholds.map((thresholdPct) => ({
        thresholdPct,
        circuitBreakerActive: drawdownPct >= thresholdPct,
      })),
    };
  });

  return NextResponse.json({
    version: "ag-drawdown-stress-v1",
    assumptions: {
      referenceTotalCapital: 200,
      fullyDeployedAgSleeve: sleeveCapital,
      fourPositionsAt: 10,
      note: "Diagnostic only. No transactions, persistence, AI decisions, or automatic SELL behavior.",
    },
    thresholds,
    scenarios,
  });
}
