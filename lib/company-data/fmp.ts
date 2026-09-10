import type { CompanyFundamentals } from "./types";

type FmpProfile = {
  symbol?: string;
  companyName?: string;
  marketCap?: number;
  mktCap?: number;
};

type FmpIncomeStatement = {
  symbol?: string;
  calendarYear?: string;
  fiscalYear?: string;
  period?: string;
  revenue?: number;
  operatingIncome?: number;
  netIncome?: number;
};

type FmpCashFlowStatement = {
  operatingCashFlow?: number;
  capitalExpenditure?: number;
  capitalExpenditures?: number;
  freeCashFlow?: number;
};

type FmpBalanceSheet = {
  cashAndCashEquivalents?: number;
  cashAndShortTermInvestments?: number;
  totalDebt?: number;
};

type FmpRatiosTtm = {
  priceToEarningsRatioTTM?: number;
  priceToBookRatioTTM?: number;
  priceToSalesRatioTTM?: number;
  priceToFreeCashFlowRatioTTM?: number;

  debtToEquityRatioTTM?: number;
  interestCoverageRatioTTM?: number;
  currentRatioTTM?: number;

  freeCashFlowOperatingCashFlowRatioTTM?: number;

  enterpriseValueTTM?: number;
};

type FmpKeyMetrics = {
  marketCap?: number;

  enterpriseValue?: number;
  enterpriseValueTTM?: number;

  evToSales?: number;
  evToSalesTTM?: number;

  evToOperatingCashFlow?: number;
  evToOperatingCashFlowTTM?: number;

  evToFreeCashFlow?: number;
  evToFreeCashFlowTTM?: number;

  evToEBITDA?: number;
  evToEBITDATTM?: number;

  netDebtToEBITDA?: number;
  netDebtToEBITDATTM?: number;

  returnOnAssetsTTM?: number;
  returnOnEquityTTM?: number;
  returnOnInvestedCapitalTTM?: number;
  returnOnCapitalEmployedTTM?: number;

  earningsYieldTTM?: number;
  freeCashFlowYieldTTM?: number;

  capexToOperatingCashFlowTTM?: number;
  capexToRevenueTTM?: number;

  researchAndDevelopementToRevenueTTM?: number;
  stockBasedCompensationToRevenueTTM?: number;
};

function first<T>(
  value: T[] | null | undefined
): T | null {
  return value?.[0] ?? null;
}

function safeRatio(
  numerator: number | null,
  denominator: number | null
) {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    denominator === 0
  ) {
    return null;
  }

  return numerator / denominator;
}

function safePositiveMultiple(
  numerator: number | null,
  denominator: number | null
) {
  if (
    numerator == null ||
    denominator == null ||
    !Number.isFinite(numerator) ||
    !Number.isFinite(denominator) ||
    numerator <= 0 ||
    denominator <= 0
  ) {
    return null;
  }

  return numerator / denominator;
}

function warnOnMaterialDifference(
  symbol: string,
  label: string,
  calculated: number | null,
  vendor: number | null
) {
  if (
    calculated == null ||
    vendor == null ||
    !Number.isFinite(calculated) ||
    !Number.isFinite(vendor)
  ) {
    return;
  }

  const scale = Math.max(
    Math.abs(calculated),
    Math.abs(vendor),
    0.0001
  );

  const relativeDifference =
    Math.abs(calculated - vendor) /
    scale;

  if (relativeDifference >= 0.2) {
    console.warn(
      `[fundamentals:${symbol}] ${label} differs materially: calculated=${calculated.toFixed(
        4
      )}, vendor=${vendor.toFixed(4)}. Calculated latest-annual value will be used where available.`
    );
  }
}

async function fetchFmp<T>(
  path: string,
  params: Record<string, string> = {}
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
        revalidate: 3600,
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

export async function getCompanyFundamentals(
  symbol: string
): Promise<CompanyFundamentals> {
  const normalizedSymbol =
    symbol
      .trim()
      .toUpperCase();

  const [
    profileData,
    incomeData,
    cashFlowData,
    balanceSheetData,
    ratiosData,
    metricsData,
  ] = await Promise.all([
    fetchFmp<FmpProfile[]>(
      "profile",
      {
        symbol:
          normalizedSymbol,
      }
    ),

    fetchFmp<FmpIncomeStatement[]>(
      "income-statement",
      {
        symbol:
          normalizedSymbol,
        period:
          "annual",
        limit:
          "2",
      }
    ),

    fetchFmp<FmpCashFlowStatement[]>(
      "cash-flow-statement",
      {
        symbol:
          normalizedSymbol,
        period:
          "annual",
        limit:
          "1",
      }
    ),

    fetchFmp<FmpBalanceSheet[]>(
      "balance-sheet-statement",
      {
        symbol:
          normalizedSymbol,
        period:
          "annual",
        limit:
          "1",
      }
    ),

    fetchFmp<FmpRatiosTtm[]>(
      "ratios-ttm",
      {
        symbol:
          normalizedSymbol,
      }
    ),

    fetchFmp<FmpKeyMetrics[]>(
      "key-metrics-ttm",
      {
        symbol:
          normalizedSymbol,
      }
    ),
  ]);

  const profile =
    first(profileData);

  const latestIncome =
    incomeData?.[0] ?? null;

  const priorIncome =
    incomeData?.[1] ?? null;

  const cashFlow =
    first(cashFlowData);

  const balanceSheet =
    first(balanceSheetData);

  const ratios =
    first(ratiosData);

  const metrics =
    first(metricsData);

  const revenue =
    latestIncome?.revenue ??
    null;

  const priorRevenue =
    priorIncome?.revenue ??
    null;

  const revenueGrowth =
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

  const operatingIncome =
    latestIncome?.operatingIncome ??
    null;

  const operatingMargin =
    revenue != null &&
    operatingIncome != null &&
    revenue !== 0
      ? (
          operatingIncome /
          revenue
        ) * 100
      : null;

  const netIncome =
    latestIncome?.netIncome ??
    null;

  const marketCap =
    profile?.marketCap ??
    profile?.mktCap ??
    metrics?.marketCap ??
    null;

  const operatingCashFlow =
    cashFlow?.operatingCashFlow ??
    null;

  const capitalExpenditures =
    cashFlow?.capitalExpenditure != null
      ? Math.abs(
          cashFlow.capitalExpenditure
        )
      : cashFlow?.capitalExpenditures != null
        ? Math.abs(
            cashFlow.capitalExpenditures
          )
        : null;

  const freeCashFlow =
    cashFlow?.freeCashFlow ??
    null;

  const enterpriseValue =
    metrics?.enterpriseValueTTM ??
    ratios?.enterpriseValueTTM ??
    metrics?.enterpriseValue ??
    null;

  /*
    Discovery should not mix vendor TTM ratios with
    latest-annual statement dollars when the same ratio
    can be calculated directly from one coherent set of
    raw values. Prefer deterministic calculations from
    latest annual statements and current market values;
    retain vendor metrics only as fallbacks.
  */

  const calculatedPe =
    safePositiveMultiple(
      marketCap,
      netIncome
    );

  const calculatedPriceToSales =
    safePositiveMultiple(
      marketCap,
      revenue
    );

  const calculatedPriceToFcf =
    safePositiveMultiple(
      marketCap,
      freeCashFlow
    );

  const calculatedEvToSales =
    safePositiveMultiple(
      enterpriseValue,
      revenue
    );

  const calculatedEvToOcf =
    safePositiveMultiple(
      enterpriseValue,
      operatingCashFlow
    );

  const calculatedEvToFcf =
    safePositiveMultiple(
      enterpriseValue,
      freeCashFlow
    );

  const calculatedFcfYieldRatio =
    safeRatio(
      freeCashFlow,
      marketCap
    );

  const calculatedFcfToOcfRatio =
    safeRatio(
      freeCashFlow,
      operatingCashFlow
    );

  const calculatedCapexToOcfRatio =
    operatingCashFlow != null &&
    operatingCashFlow > 0
      ? safeRatio(
          capitalExpenditures,
          operatingCashFlow
        )
      : null;

  const calculatedCapexToRevenueRatio =
    revenue != null &&
    revenue > 0
      ? safeRatio(
          capitalExpenditures,
          revenue
        )
      : null;

  const vendorFcfYield =
    metrics?.freeCashFlowYieldTTM != null
      ? metrics.freeCashFlowYieldTTM * 100
      : null;

  const vendorFcfToOcf =
    ratios?.freeCashFlowOperatingCashFlowRatioTTM != null
      ? ratios.freeCashFlowOperatingCashFlowRatioTTM *
        100
      : null;

  const vendorCapexToOcf =
    metrics?.capexToOperatingCashFlowTTM != null
      ? metrics.capexToOperatingCashFlowTTM *
        100
      : null;

  const vendorCapexToRevenue =
    metrics?.capexToRevenueTTM != null
      ? metrics.capexToRevenueTTM * 100
      : null;

  warnOnMaterialDifference(
    normalizedSymbol,
    "P/E",
    calculatedPe,
    ratios?.priceToEarningsRatioTTM ?? null
  );

  warnOnMaterialDifference(
    normalizedSymbol,
    "P/FCF",
    calculatedPriceToFcf,
    ratios?.priceToFreeCashFlowRatioTTM ?? null
  );

  warnOnMaterialDifference(
    normalizedSymbol,
    "EV/FCF",
    calculatedEvToFcf,
    metrics?.evToFreeCashFlowTTM ??
      metrics?.evToFreeCashFlow ??
      null
  );

  warnOnMaterialDifference(
    normalizedSymbol,
    "FCF yield (%)",
    calculatedFcfYieldRatio != null
      ? calculatedFcfYieldRatio * 100
      : null,
    vendorFcfYield
  );

  warnOnMaterialDifference(
    normalizedSymbol,
    "FCF/OCF (%)",
    calculatedFcfToOcfRatio != null
      ? calculatedFcfToOcfRatio * 100
      : null,
    vendorFcfToOcf
  );

  warnOnMaterialDifference(
    normalizedSymbol,
    "CapEx/OCF (%)",
    calculatedCapexToOcfRatio != null
      ? calculatedCapexToOcfRatio * 100
      : null,
    vendorCapexToOcf
  );

  warnOnMaterialDifference(
    normalizedSymbol,
    "CapEx/Revenue (%)",
    calculatedCapexToRevenueRatio != null
      ? calculatedCapexToRevenueRatio * 100
      : null,
    vendorCapexToRevenue
  );

  return {
    symbol:
      profile?.symbol ??
      latestIncome?.symbol ??
      normalizedSymbol,

    companyName:
      profile?.companyName ??
      null,

    marketCap,

    peRatio:
      calculatedPe ??
      ratios?.priceToEarningsRatioTTM ??
      null,

    priceToSalesRatio:
      calculatedPriceToSales ??
      ratios?.priceToSalesRatioTTM ??
      null,

    priceToBookRatio:
      ratios?.priceToBookRatioTTM ??
      null,

    priceToFreeCashFlowRatio:
      calculatedPriceToFcf ??
      ratios?.priceToFreeCashFlowRatioTTM ??
      null,

    enterpriseValue,

    evToSales:
      calculatedEvToSales ??
      metrics?.evToSalesTTM ??
      metrics?.evToSales ??
      null,

    evToOperatingCashFlow:
      calculatedEvToOcf ??
      metrics?.evToOperatingCashFlowTTM ??
      metrics?.evToOperatingCashFlow ??
      null,

    evToFreeCashFlow:
      calculatedEvToFcf ??
      metrics?.evToFreeCashFlowTTM ??
      metrics?.evToFreeCashFlow ??
      null,

    evToEbitda:
      metrics?.evToEBITDATTM ??
      metrics?.evToEBITDA ??
      null,

    earningsYield:
      calculatedPe != null &&
      calculatedPe > 0
        ? (1 / calculatedPe) * 100
        : metrics?.earningsYieldTTM != null
          ? metrics.earningsYieldTTM * 100
          : null,

    freeCashFlowYield:
      calculatedFcfYieldRatio != null &&
      Number.isFinite(
        calculatedFcfYieldRatio
      )
        ? calculatedFcfYieldRatio * 100
        : vendorFcfYield,

    returnOnEquity:
      metrics?.returnOnEquityTTM != null
        ? metrics.returnOnEquityTTM * 100
        : null,

    returnOnAssets:
      metrics?.returnOnAssetsTTM != null
        ? metrics.returnOnAssetsTTM * 100
        : null,

    returnOnInvestedCapital:
      metrics?.returnOnInvestedCapitalTTM != null
        ? metrics.returnOnInvestedCapitalTTM *
          100
        : null,

    returnOnCapitalEmployed:
      metrics?.returnOnCapitalEmployedTTM != null
        ? metrics.returnOnCapitalEmployedTTM *
          100
        : null,

    debtToEquity:
      ratios?.debtToEquityRatioTTM ??
      null,

    netDebtToEbitda:
      metrics?.netDebtToEBITDATTM ??
      metrics?.netDebtToEBITDA ??
      null,

    interestCoverage:
      ratios?.interestCoverageRatioTTM ??
      null,

    currentRatio:
      ratios?.currentRatioTTM ??
      null,

    freeCashFlowToOperatingCashFlow:
      calculatedFcfToOcfRatio != null
        ? calculatedFcfToOcfRatio * 100
        : vendorFcfToOcf,

    capexToOperatingCashFlow:
      calculatedCapexToOcfRatio != null
        ? calculatedCapexToOcfRatio * 100
        : vendorCapexToOcf,

    capexToRevenue:
      calculatedCapexToRevenueRatio != null
        ? calculatedCapexToRevenueRatio * 100
        : vendorCapexToRevenue,

    researchAndDevelopmentToRevenue:
      metrics?.researchAndDevelopementToRevenueTTM != null
        ? metrics
            .researchAndDevelopementToRevenueTTM *
          100
        : null,

    stockBasedCompensationToRevenue:
      metrics?.stockBasedCompensationToRevenueTTM != null
        ? metrics
            .stockBasedCompensationToRevenueTTM *
          100
        : null,

    revenue,

    revenueGrowth,

    operatingIncome,

    operatingMargin,

    netIncome,

    operatingCashFlow,

    capitalExpenditures,

    freeCashFlow,

    cashAndEquivalents:
      balanceSheet?.cashAndCashEquivalents ??
      balanceSheet?.cashAndShortTermInvestments ??
      null,

    totalDebt:
      balanceSheet?.totalDebt ??
      null,

    fiscalPeriod:
      latestIncome?.period ??
      null,

    fiscalYear:
      latestIncome?.calendarYear ??
      latestIncome?.fiscalYear ??
      null,
  };
}