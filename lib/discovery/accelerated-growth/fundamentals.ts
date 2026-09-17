import type {
  AcceleratedGrowthFundamentals,
  AccelerationDirection,
  QuarterlyGrowthPoint,
  TrajectoryMetrics,
} from "./types";

type FmpQuarterlyIncome = {
  date?: string;
  fiscalYear?: string;
  calendarYear?: string;
  period?: string;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
};

type FmpQuarterlyCashFlow = {
  date?: string;
  fiscalYear?: string;
  calendarYear?: string;
  period?: string;
  freeCashFlow?: number;
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  capitalExpenditures?: number;
};

async function fetchFmp<T>(path: string, params: Record<string, string>): Promise<T> {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY is not configured.");

  const url = new URL(`https://financialmodelingprep.com/stable/${path}`);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, { next: { revalidate: 3600 } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FMP ${path} request failed with status ${response.status}: ${text.slice(0, 250)}`);
  }
  return (await response.json()) as T;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function percentChange(current: number | null, prior: number | null): number | null {
  if (current == null || prior == null || prior === 0) return null;
  return ((current - prior) / Math.abs(prior)) * 100;
}

function margin(numerator: number | null, revenue: number | null): number | null {
  if (numerator == null || revenue == null || revenue === 0) return null;
  return (numerator / revenue) * 100;
}

function trajectory(values: Array<number | null>, maxPoints = 4): TrajectoryMetrics {
  const usable = values
    .slice(0, maxPoints)
    .filter((value): value is number => value != null && Number.isFinite(value));

  if (usable.length === 0) {
    return { latest: null, slope: null, recentChange: null, consistency: null, pointCount: 0 };
  }

  // Input is newest -> oldest. Reverse so x increases through time.
  const chronological = [...usable].reverse();
  const latest = usable[0];
  const recentChange = usable.length >= 2 ? usable[0] - usable[1] : null;

  let slope: number | null = null;
  if (chronological.length >= 2) {
    const n = chronological.length;
    const meanX = (n - 1) / 2;
    const meanY = chronological.reduce((sum, value) => sum + value, 0) / n;
    let numerator = 0;
    let denominator = 0;
    chronological.forEach((value, index) => {
      numerator += (index - meanX) * (value - meanY);
      denominator += (index - meanX) ** 2;
    });
    slope = denominator === 0 ? null : numerator / denominator;
  }

  let consistency: number | null = null;
  if (chronological.length >= 2) {
    const changes = chronological.slice(1).map((value, index) => value - chronological[index]);
    const positive = changes.filter((change) => change > 0.05).length;
    const negative = changes.filter((change) => change < -0.05).length;
    consistency = (positive - negative) / changes.length;
  }

  return { latest, slope, recentChange, consistency, pointCount: usable.length };
}

function classifyTrajectory(metrics: TrajectoryMetrics): AccelerationDirection {
  if (metrics.pointCount < 3 || metrics.slope == null) return "insufficient_data";
  const consistency = metrics.consistency ?? 0;
  if (metrics.slope >= 4 && consistency >= 0.5) return "strongly_accelerating";
  if (metrics.slope >= 1 && consistency >= 0) return "accelerating";
  if (metrics.slope <= -4 && consistency <= -0.5) return "strongly_decelerating";
  if (metrics.slope <= -1 && consistency <= 0) return "decelerating";
  return "stable";
}

export async function getAcceleratedGrowthFundamentals(symbol: string): Promise<AcceleratedGrowthFundamentals> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  const [income, cashFlow] = await Promise.all([
    fetchFmp<FmpQuarterlyIncome[]>("income-statement", { symbol: normalizedSymbol, period: "quarter", limit: "8" }),
    fetchFmp<FmpQuarterlyCashFlow[]>("cash-flow-statement", { symbol: normalizedSymbol, period: "quarter", limit: "8" }),
  ]);

  const cashFlowByDate = new Map((cashFlow ?? []).map((row) => [row.date ?? "", row]));

  const quarters: QuarterlyGrowthPoint[] = (income ?? []).slice(0, 8).map((row, index, rows) => {
    const revenue = finite(row.revenue);
    const operatingIncome = finite(row.operatingIncome);
    const netIncome = finite(row.netIncome);
    const cash = cashFlowByDate.get(row.date ?? "") ?? cashFlow?.[index];
    const vendorFreeCashFlow = finite(cash?.freeCashFlow);
    const operatingCashFlow = finite(cash?.operatingCashFlow);
    const capex = finite(cash?.capitalExpenditure ?? cash?.capitalExpenditures);
    const freeCashFlow = vendorFreeCashFlow ??
      (operatingCashFlow != null && capex != null ? operatingCashFlow + capex : null);
    const yearAgoRevenue = finite(rows[index + 4]?.revenue);

    return {
      date: row.date ?? null,
      fiscalYear: row.fiscalYear ?? row.calendarYear ?? null,
      period: row.period ?? null,
      revenue,
      operatingIncome,
      netIncome,
      freeCashFlow,
      revenueGrowthYoY: percentChange(revenue, yearAgoRevenue),
      operatingMargin: margin(operatingIncome, revenue),
      freeCashFlowMargin: margin(freeCashFlow, revenue),
    };
  });

  const revenueGrowth = quarters.map((quarter) => quarter.revenueGrowthYoY);
  const revenueTrajectory = trajectory(revenueGrowth, 4);
  const operatingMarginTrajectory = trajectory(quarters.map((quarter) => quarter.operatingMargin), 4);
  const freeCashFlowMarginTrajectory = trajectory(quarters.map((quarter) => quarter.freeCashFlowMargin), 4);

  const eligibleForScoring =
    quarters.length >= 8 &&
    revenueTrajectory.pointCount >= 4 &&
    operatingMarginTrajectory.pointCount >= 3 &&
    freeCashFlowMarginTrajectory.pointCount >= 3 &&
    (income ?? []).length > 0 &&
    (cashFlow ?? []).length > 0;

  return {
    symbol: normalizedSymbol,
    quarters,
    revenueAcceleration: revenueTrajectory.recentChange,
    operatingMarginChange: operatingMarginTrajectory.recentChange,
    freeCashFlowMarginChange: freeCashFlowMarginTrajectory.recentChange,
    revenueTrajectory,
    operatingMarginTrajectory,
    freeCashFlowMarginTrajectory,
    accelerationDirection: classifyTrajectory(revenueTrajectory),
    dataQuality: {
      quarterCount: quarters.length,
      comparableRevenueGrowthPoints: revenueTrajectory.pointCount,
      hasQuarterlyIncome: (income ?? []).length > 0,
      hasQuarterlyCashFlow: (cashFlow ?? []).length > 0,
      eligibleForScoring,
    },
  };
}
