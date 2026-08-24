import type {
  CompanyFundamentalTrends,
  HistoricalMetricPoint,
  HistoricalMetricTrend,
} from "./types";

type FmpIncomeStatement = {
  fiscalYear?: string;
  calendarYear?: string;

  revenue?: number;
  operatingIncome?: number;

  weightedAverageShsOutDil?: number;
  weightedAverageShsOut?: number;
};

type FmpCashFlowStatement = {
  fiscalYear?: string;
  calendarYear?: string;

  freeCashFlow?: number;

  capitalExpenditure?: number;
  capitalExpenditures?: number;
};

type FmpKeyMetrics = {
  fiscalYear?: string;
  date?: string;

  returnOnInvestedCapital?: number;
  capexToRevenue?: number;
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
      `FMP ${path} request failed with status ${response.status}: ${text.slice(
        0,
        250
      )}`
    );
  }

  return (
    await response.json()
  ) as T;
}

function getFiscalYear(
  item: {
    fiscalYear?: string;
    calendarYear?: string;
    date?: string;
  }
) {
  if (item.fiscalYear) {
    return item.fiscalYear;
  }

  if (item.calendarYear) {
    return item.calendarYear;
  }

  if (item.date) {
    return item.date.slice(
      0,
      4
    );
  }

  return "";
}

function sortPoints(
  points: HistoricalMetricPoint[]
) {
  return [...points].sort(
    (a, b) =>
      Number(a.fiscalYear) -
      Number(b.fiscalYear)
  );
}

function classifyDirection(
  points: HistoricalMetricPoint[],
  higherIsBetter = true
): HistoricalMetricTrend["direction"] {
  const values =
    points
      .map(
        (point) =>
          point.value
      )
      .filter(
        (
          value
        ): value is number =>
          value != null &&
          Number.isFinite(value)
      );

  if (values.length < 2) {
    return "unavailable";
  }

  // ---------------------------------------------------------
  // Recent trajectory
  // ---------------------------------------------------------

  /*
    Give greater importance to the most recent
    three observations.

    This prevents an unusual older year from
    overwhelming a clear recent recovery or
    deterioration.
  */

  if (values.length >= 3) {
    const recent =
      values.slice(-3);

    const recentChanges =
      recent
        .slice(1)
        .map(
          (
            value,
            index
          ) =>
            value -
            recent[index]
        );

    const allRecentPositive =
      recentChanges.every(
        (change) =>
          change > 0
      );

    const allRecentNegative =
      recentChanges.every(
        (change) =>
          change < 0
      );

    if (
      allRecentPositive
    ) {
      return higherIsBetter
        ? "improving"
        : "deteriorating";
    }

    if (
      allRecentNegative
    ) {
      return higherIsBetter
        ? "deteriorating"
        : "improving";
    }
  }

  // ---------------------------------------------------------
  // Full-period change
  // ---------------------------------------------------------

  const first =
    values[0];

  const last =
    values[
      values.length - 1
    ];

  if (first === 0) {
    return "mixed";
  }

  const changePct =
    (
      (last - first) /
      Math.abs(first)
    ) * 100;

  if (
    Math.abs(changePct) < 5
  ) {
    return "stable";
  }

  // ---------------------------------------------------------
  // Overall consistency
  // ---------------------------------------------------------

  const stepChanges =
    values
      .slice(1)
      .map(
        (
          value,
          index
        ) =>
          value -
          values[index]
      );

  const improvingSteps =
    stepChanges.filter(
      (change) =>
        higherIsBetter
          ? change > 0
          : change < 0
    ).length;

  const deterioratingSteps =
    stepChanges.filter(
      (change) =>
        higherIsBetter
          ? change < 0
          : change > 0
    ).length;

  const requiredMajority =
    Math.ceil(
      stepChanges.length *
        0.75
    );

  if (
    improvingSteps >=
    requiredMajority
  ) {
    return "improving";
  }

  if (
    deterioratingSteps >=
    requiredMajority
  ) {
    return "deteriorating";
  }

  return "mixed";
}
function buildTrend(
  rawPoints: HistoricalMetricPoint[],
  higherIsBetter = true
): HistoricalMetricTrend {
  const points =
    sortPoints(
      rawPoints
    );

  const valid =
    points.filter(
      (
        point
      ): point is {
        fiscalYear: string;
        value: number;
      } =>
        point.value != null &&
        Number.isFinite(
          point.value
        )
    );

  const oldest =
    valid[0]?.value ??
    null;

  const latest =
    valid[
      valid.length - 1
    ]?.value ??
    null;

  const absoluteChange =
    oldest != null &&
    latest != null
      ? latest -
        oldest
      : null;

  const percentChange =
    oldest != null &&
    latest != null &&
    oldest !== 0
      ? (
          (
            latest -
            oldest
          ) /
          Math.abs(oldest)
        ) * 100
      : null;

  return {
    points,

    latest,
    oldest,

    absoluteChange,

    percentChange,

    direction:
      classifyDirection(
        points,
        higherIsBetter
      ),
  };
}

function calculateCagr(
  points: HistoricalMetricPoint[]
) {
  const valid =
    sortPoints(points).filter(
      (
        point
      ): point is {
        fiscalYear: string;
        value: number;
      } =>
        point.value != null &&
        point.value > 0
    );

  if (
    valid.length < 2
  ) {
    return null;
  }

  const first =
    valid[0];

  const last =
    valid[
      valid.length - 1
    ];

  const years =
    Number(
      last.fiscalYear
    ) -
    Number(
      first.fiscalYear
    );

  if (
    years <= 0
  ) {
    return null;
  }

  return (
    (
      Math.pow(
        last.value /
          first.value,
        1 / years
      ) -
      1
    ) *
    100
  );
}

export async function getCompanyFundamentalTrends(
  symbol: string
): Promise<CompanyFundamentalTrends> {
  const normalizedSymbol =
    symbol
      .trim()
      .toUpperCase();

  const [
    incomeData,
    cashFlowData,
    metricsData,
  ] = await Promise.all([
    fetchFmp<
      FmpIncomeStatement[]
    >(
      "income-statement",
      {
        symbol:
          normalizedSymbol,
        period:
          "annual",
        limit:
          "5",
      }
    ),

    fetchFmp<
      FmpCashFlowStatement[]
    >(
      "cash-flow-statement",
      {
        symbol:
          normalizedSymbol,
        period:
          "annual",
        limit:
          "5",
      }
    ),

    fetchFmp<
      FmpKeyMetrics[]
    >(
      "key-metrics",
      {
        symbol:
          normalizedSymbol,
        period:
          "annual",
        limit:
          "5",
      }
    ),
  ]);

  const cashFlowByYear =
    new Map(
      (cashFlowData ?? []).map(
        (item) => [
          getFiscalYear(
            item
          ),
          item,
        ]
      )
    );

  const metricsByYear =
    new Map(
      (metricsData ?? []).map(
        (item) => [
          getFiscalYear(
            item
          ),
          item,
        ]
      )
    );

  const revenuePoints =
    (incomeData ?? []).map(
      (item) => ({
        fiscalYear:
          getFiscalYear(item),

        value:
          item.revenue ??
          null,
      })
    );

  const operatingMarginPoints =
    (incomeData ?? []).map(
      (item) => {
        const revenue =
          item.revenue ??
          null;

        const operatingIncome =
          item.operatingIncome ??
          null;

        return {
          fiscalYear:
            getFiscalYear(
              item
            ),

          value:
            revenue != null &&
            operatingIncome != null &&
            revenue !== 0
              ? (
                  operatingIncome /
                  revenue
                ) * 100
              : null,
        };
      }
    );

  const freeCashFlowMarginPoints =
    (incomeData ?? []).map(
      (item) => {
        const fiscalYear =
          getFiscalYear(
            item
          );

        const cashFlow =
          cashFlowByYear.get(
            fiscalYear
          );

        const revenue =
          item.revenue ??
          null;

        const freeCashFlow =
          cashFlow
            ?.freeCashFlow ??
          null;

        return {
          fiscalYear,

          value:
            revenue != null &&
            freeCashFlow != null &&
            revenue !== 0
              ? (
                  freeCashFlow /
                  revenue
                ) * 100
              : null,
        };
      }
    );

  const roicPoints =
    (metricsData ?? []).map(
      (item) => ({
        fiscalYear:
          getFiscalYear(
            item
          ),

        value:
          item.returnOnInvestedCapital != null
            ? item
                .returnOnInvestedCapital *
              100
            : null,
      })
    );

  const shareCountPoints =
    (incomeData ?? []).map(
      (item) => ({
        fiscalYear:
          getFiscalYear(
            item
          ),

        value:
          item.weightedAverageShsOutDil ??
          item.weightedAverageShsOut ??
          null,
      })
    );

  const capexToRevenuePoints =
    (incomeData ?? []).map(
      (item) => {
        const fiscalYear =
          getFiscalYear(
            item
          );

        const metric =
          metricsByYear.get(
            fiscalYear
          );

        if (
          metric?.capexToRevenue != null
        ) {
          return {
            fiscalYear,

            value:
              metric.capexToRevenue *
              100,
          };
        }

        const cashFlow =
          cashFlowByYear.get(
            fiscalYear
          );

        const revenue =
          item.revenue ??
          null;

        const capexRaw =
          cashFlow
            ?.capitalExpenditure ??
          cashFlow
            ?.capitalExpenditures ??
          null;

        const capex =
          capexRaw != null
            ? Math.abs(
                capexRaw
              )
            : null;

        return {
          fiscalYear,

          value:
            revenue != null &&
            capex != null &&
            revenue !== 0
              ? (
                  capex /
                  revenue
                ) * 100
              : null,
        };
      }
    );

  const revenueSorted =
    sortPoints(
      revenuePoints
    );

  return {
    symbol:
      normalizedSymbol,

    revenue: {
      points:
        revenueSorted,

      cagrPct:
        calculateCagr(
          revenueSorted
        ),

      direction:
        classifyDirection(
          revenueSorted,
          true
        ),
    },

    operatingMargin:
      buildTrend(
        operatingMarginPoints,
        true
      ),

    freeCashFlowMargin:
      buildTrend(
        freeCashFlowMarginPoints,
        true
      ),

    returnOnInvestedCapital:
      buildTrend(
        roicPoints,
        true
      ),

    /*
      Lower share count is generally better because it
      represents reduced dilution / buybacks.
    */
    shareCount:
      buildTrend(
        shareCountPoints,
        false
      ),

    /*
      Lower capital intensity is generally favorable,
      all else equal.
    */
    capexToRevenue:
      buildTrend(
        capexToRevenuePoints,
        false
      ),
  };
}