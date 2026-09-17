import type {
  AcceleratedGrowthFundamentals,
  AccelerationDirection,
  QuarterlyGrowthPoint,
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

async function fetchFmp<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error("FMP_API_KEY is not configured.");
  }

  const url = new URL(
    `https://financialmodelingprep.com/stable/${path}`
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("apikey", apiKey);

  const response = await fetch(url, {
    next: { revalidate: 3600 },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `FMP ${path} request failed with status ${response.status}: ${text.slice(0, 250)}`
    );
  }

  return (await response.json()) as T;
}

function finite(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : null;
}

function percentChange(
  current: number | null,
  prior: number | null
): number | null {
  if (current == null || prior == null || prior === 0) {
    return null;
  }

  return ((current - prior) / Math.abs(prior)) * 100;
}

function margin(
  numerator: number | null,
  revenue: number | null
): number | null {
  if (numerator == null || revenue == null || revenue === 0) {
    return null;
  }

  return (numerator / revenue) * 100;
}

function classifyAcceleration(
  acceleration: number | null
): AccelerationDirection {
  if (acceleration == null) return "insufficient_data";
  if (acceleration >= 10) return "strongly_accelerating";
  if (acceleration >= 3) return "accelerating";
  if (acceleration > -3) return "stable";
  if (acceleration > -10) return "decelerating";
  return "strongly_decelerating";
}

function latestDifference(
  values: Array<number | null>
): number | null {
  const usable = values.filter(
    (value): value is number => value != null && Number.isFinite(value)
  );

  if (usable.length < 2) return null;
  return usable[0] - usable[1];
}

export async function getAcceleratedGrowthFundamentals(
  symbol: string
): Promise<AcceleratedGrowthFundamentals> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  // Eight quarters are required to calculate four year-over-year growth points.
  // This deliberately uses the existing FMP statement endpoints and current API key;
  // no new data provider is introduced for AG V1.
  const [income, cashFlow] = await Promise.all([
    fetchFmp<FmpQuarterlyIncome[]>("income-statement", {
      symbol: normalizedSymbol,
      period: "quarter",
      limit: "8",
    }),
    fetchFmp<FmpQuarterlyCashFlow[]>("cash-flow-statement", {
      symbol: normalizedSymbol,
      period: "quarter",
      limit: "8",
    }),
  ]);

  const cashFlowByDate = new Map(
    (cashFlow ?? []).map((row) => [row.date ?? "", row])
  );

  const quarters: QuarterlyGrowthPoint[] = (income ?? [])
    .slice(0, 8)
    .map((row, index, rows) => {
      const revenue = finite(row.revenue);
      const operatingIncome = finite(row.operatingIncome);
      const netIncome = finite(row.netIncome);
      const cash = cashFlowByDate.get(row.date ?? "") ?? cashFlow?.[index];
      const freeCashFlow = finite(cash?.freeCashFlow);
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
  const revenueAcceleration = latestDifference(revenueGrowth);
  const operatingMarginChange = latestDifference(
    quarters.map((quarter) => quarter.operatingMargin)
  );
  const freeCashFlowMarginChange = latestDifference(
    quarters.map((quarter) => quarter.freeCashFlowMargin)
  );

  return {
    symbol: normalizedSymbol,
    quarters,
    revenueAcceleration,
    operatingMarginChange,
    freeCashFlowMarginChange,
    accelerationDirection: classifyAcceleration(revenueAcceleration),
    dataQuality: {
      quarterCount: quarters.length,
      comparableRevenueGrowthPoints: revenueGrowth.filter(
        (value) => value != null
      ).length,
      hasQuarterlyIncome: (income ?? []).length > 0,
      hasQuarterlyCashFlow: (cashFlow ?? []).length > 0,
    },
  };
}
