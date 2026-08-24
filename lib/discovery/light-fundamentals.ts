export type LightFundamentals = {
  ticker: string;

  revenue: number | null;
  revenueGrowthPct: number | null;

  operatingMarginPct: number | null;

  freeCashFlow: number | null;

  netDebtToEbitda: number | null;

  returnOnInvestedCapitalPct:
    number | null;

  freeCashFlowYieldPct:
    number | null;
};

type FmpIncomeStatement = {
  symbol?: string;
  revenue?: number;
  operatingIncome?: number;
};

type FmpCashFlowStatement = {
  freeCashFlow?: number;
};

type FmpKeyMetricsTtm = {
  netDebtToEBITDATTM?: number;
  returnOnInvestedCapitalTTM?: number;
  freeCashFlowYieldTTM?: number;
};

async function fetchFmp<T>(
  path: string,
  params: Record<string, string>
): Promise<T> {
  const apiKey =
    process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FMP_API_KEY is not configured."
    );
  }

  const url = new URL(
    `https://financialmodelingprep.com/stable/${path}`
  );

  for (
    const [key, value]
    of Object.entries(params)
  ) {
    url.searchParams.set(
      key,
      value
    );
  }

  url.searchParams.set(
    "apikey",
    apiKey
  );

  const response =
    await fetch(url, {
      next: {
        revalidate: 21600,
      },
    });

  if (!response.ok) {
    const text =
      await response.text();

    throw new Error(
      `FMP ${path} failed with status ${response.status}: ${text.slice(
        0,
        200
      )}`
    );
  }

  return (
    await response.json()
  ) as T;
}

export async function getLightFundamentals(
  ticker: string
): Promise<LightFundamentals> {
  const normalizedTicker =
    ticker
      .trim()
      .toUpperCase();

  const [
    income,
    cashFlow,
    metrics,
  ] = await Promise.all([
    fetchFmp<
      FmpIncomeStatement[]
    >(
      "income-statement",
      {
        symbol:
          normalizedTicker,
        period:
          "annual",
        limit:
          "2",
      }
    ),

    fetchFmp<
      FmpCashFlowStatement[]
    >(
      "cash-flow-statement",
      {
        symbol:
          normalizedTicker,
        period:
          "annual",
        limit:
          "1",
      }
    ),

    fetchFmp<
      FmpKeyMetricsTtm[]
    >(
      "key-metrics-ttm",
      {
        symbol:
          normalizedTicker,
      }
    ),
  ]);

  const latestIncome =
    income?.[0] ?? null;

  const priorIncome =
    income?.[1] ?? null;

  const latestCashFlow =
    cashFlow?.[0] ?? null;

  const latestMetrics =
    metrics?.[0] ?? null;

  const revenue =
    latestIncome?.revenue ??
    null;

  const priorRevenue =
    priorIncome?.revenue ??
    null;

  const revenueGrowthPct =
    revenue != null &&
    priorRevenue != null &&
    priorRevenue !== 0
      ? (
          (
            revenue -
            priorRevenue
          ) /
          Math.abs(
            priorRevenue
          )
        ) * 100
      : null;

  const operatingMarginPct =
    revenue != null &&
    latestIncome
      ?.operatingIncome != null &&
    revenue !== 0
      ? (
          latestIncome
            .operatingIncome /
          revenue
        ) * 100
      : null;

  return {
    ticker:
      normalizedTicker,

    revenue,

    revenueGrowthPct,

    operatingMarginPct,

    freeCashFlow:
      latestCashFlow
        ?.freeCashFlow ??
      null,

    netDebtToEbitda:
      latestMetrics
        ?.netDebtToEBITDATTM ??
      null,

    returnOnInvestedCapitalPct:
      latestMetrics
        ?.returnOnInvestedCapitalTTM !=
      null
        ? latestMetrics
            .returnOnInvestedCapitalTTM *
          100
        : null,

    freeCashFlowYieldPct:
      latestMetrics
        ?.freeCashFlowYieldTTM !=
      null
        ? latestMetrics
            .freeCashFlowYieldTTM *
          100
        : null,
  };
}