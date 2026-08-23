export type CompanyFundamentals = {
  symbol: string;
  companyName: string | null;

  marketCap: number | null;
  peRatio: number | null;
  priceToSalesRatio: number | null;
  priceToBookRatio: number | null;

  revenue: number | null;
  revenueGrowth: number | null;

  operatingIncome: number | null;
  operatingMargin: number | null;

  netIncome: number | null;

  operatingCashFlow: number | null;
  capitalExpenditures: number | null;
  freeCashFlow: number | null;

  cashAndEquivalents: number | null;
  totalDebt: number | null;

  debtToEquity: number | null;
  returnOnEquity: number | null;

  fiscalPeriod: string | null;
  fiscalYear: string | null;

enterpriseValue: number | null;

evToSales: number | null;
evToOperatingCashFlow: number | null;
evToFreeCashFlow: number | null;
evToEbitda: number | null;

netDebtToEbitda: number | null;

freeCashFlowYield: number | null;

priceToFreeCashFlowRatio: number | null;

earningsYield: number | null;

returnOnAssets: number | null;
returnOnInvestedCapital: number | null;
returnOnCapitalEmployed: number | null;

interestCoverage: number | null;
currentRatio: number | null;

freeCashFlowToOperatingCashFlow: number | null;
capexToOperatingCashFlow: number | null;
capexToRevenue: number | null;
researchAndDevelopmentToRevenue: number | null;
stockBasedCompensationToRevenue: number | null;
};