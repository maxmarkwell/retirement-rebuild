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

type FmpKeyMetrics = {
  marketCap?: number;
  enterpriseValue?: number;

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

  peRatio?: number;
  priceToSalesRatio?: number;
  priceToBookRatio?: number;
  pbRatio?: number;

  debtToEquity?: number;

  roe?: number;
  returnOnEquity?: number;
};

function first<T>(
  value: T[] | null | undefined
): T | null {
  return value?.[0] ?? null;
}

async function fetchFmp<T>(
  path: string,
  params: Record<string, string> = {}
): Promise<T> {
  const apiKey = process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FMP_API_KEY is not configured."
    );
  }

  const url = new URL(
    `https://financialmodelingprep.com/stable/${path}`
  );

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(
      key,
      value
    );
  }

  url.searchParams.set(
    "apikey",
    apiKey
  );

  const response = await fetch(url, {
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
  const normalizedSymbol = symbol
    .trim()
    .toUpperCase();

  const [
    profileData,
    incomeData,
    cashFlowData,
    balanceSheetData,
    metricsData,
  ] = await Promise.all([
    fetchFmp<FmpProfile[]>(
      "profile",
      {
        symbol: normalizedSymbol,
      }
    ),

    fetchFmp<FmpIncomeStatement[]>(
      "income-statement",
      {
        symbol: normalizedSymbol,
        period: "annual",
        limit: "2",
      }
    ),

    fetchFmp<FmpCashFlowStatement[]>(
      "cash-flow-statement",
      {
        symbol: normalizedSymbol,
        period: "annual",
        limit: "1",
      }
    ),

    fetchFmp<FmpBalanceSheet[]>(
      "balance-sheet-statement",
      {
        symbol: normalizedSymbol,
        period: "annual",
        limit: "1",
      }
    ),

    fetchFmp<FmpKeyMetrics[]>(
      "key-metrics-ttm",
      {
        symbol: normalizedSymbol,
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

  const rawRoe =
    metrics?.returnOnEquity ??
    metrics?.roe ??
    null;

  const marketCap =
    profile?.marketCap ??
    profile?.mktCap ??
    metrics?.marketCap ??
    null;

  const freeCashFlow =
    cashFlow?.freeCashFlow ??
    null;

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
      metrics?.peRatio ??
      null,

    priceToSalesRatio:
      metrics?.priceToSalesRatio ??
      null,

    priceToBookRatio:
      metrics?.priceToBookRatio ??
      metrics?.pbRatio ??
      null,

    enterpriseValue:
      metrics?.enterpriseValue ??
      null,

    evToSales:
      metrics?.evToSalesTTM ??
      metrics?.evToSales ??
      null,

    evToOperatingCashFlow:
      metrics?.evToOperatingCashFlowTTM ??
      metrics?.evToOperatingCashFlow ??
      null,

    evToFreeCashFlow:
      metrics?.evToFreeCashFlowTTM ??
      metrics?.evToFreeCashFlow ??
      null,

    evToEbitda:
      metrics?.evToEBITDATTM ??
      metrics?.evToEBITDA ??
      null,

    netDebtToEbitda:
      metrics?.netDebtToEBITDATTM ??
      metrics?.netDebtToEBITDA ??
      null,

    freeCashFlowYield:
      freeCashFlow != null &&
      marketCap != null &&
      marketCap > 0
        ? (
            freeCashFlow /
            marketCap
          ) * 100
        : null,

    revenue,

    revenueGrowth,

    operatingIncome,

    operatingMargin,

    netIncome:
      latestIncome?.netIncome ??
      null,

    operatingCashFlow:
      cashFlow?.operatingCashFlow ??
      null,

    capitalExpenditures:
      cashFlow?.capitalExpenditure != null
        ? Math.abs(
            cashFlow.capitalExpenditure
          )
        : cashFlow?.capitalExpenditures != null
          ? Math.abs(
              cashFlow.capitalExpenditures
            )
          : null,

    freeCashFlow,

    cashAndEquivalents:
      balanceSheet?.cashAndCashEquivalents ??
      balanceSheet?.cashAndShortTermInvestments ??
      null,

    totalDebt:
      balanceSheet?.totalDebt ??
      null,

    debtToEquity:
      metrics?.debtToEquity ??
      null,

    returnOnEquity:
      rawRoe != null
        ? (
            Math.abs(rawRoe) <= 1
              ? rawRoe * 100
              : rawRoe
          )
        : null,

    fiscalPeriod:
      latestIncome?.period ??
      null,

    fiscalYear:
      latestIncome?.calendarYear ??
      latestIncome?.fiscalYear ??
      null,
  };
}