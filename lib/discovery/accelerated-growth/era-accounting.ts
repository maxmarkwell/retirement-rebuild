export const AG_STRATEGY_KEY = "accelerated_growth";
export const AG_STRATEGY_VERSION = "ag-v1";

export type StrategyEra = {
  id: string;
  portfolio_id: string;
  strategy_key: string;
  strategy_version: string;
  inception_at: string;
  reference_total_capital: number;
  execution_mode: "paper" | "real";
  ended_at: string | null;
};

export type EraTransaction = {
  type: "buy" | "sell" | "contribution" | string;
  total_amount: number | null;
  created_at: string;
};

export type AgEraAccounting = {
  referenceTotalCapital: number;
  sleeveCap: number;
  eraBuys: number;
  eraSells: number;
  eraContributions: number;
  eraNetDeployed: number;
  eraCash: number;
};

const money = (n: number) => Math.round(n * 100) / 100;

/**
 * AG accounting is prospective from the strategy-era inception boundary.
 * Historical AI Active transactions are deliberately excluded.
 */
export function calculateAgEraAccounting(
  era: StrategyEra,
  transactions: EraTransaction[],
): AgEraAccounting {
  const inception = new Date(era.inception_at).getTime();
  const relevant = transactions.filter((tx) => {
    const timestamp = new Date(tx.created_at).getTime();
    return Number.isFinite(timestamp) && timestamp >= inception;
  });

  let eraBuys = 0;
  let eraSells = 0;
  let eraContributions = 0;

  for (const tx of relevant) {
    const amount = Math.max(0, Number(tx.total_amount ?? 0));
    if (tx.type === "buy") eraBuys += amount;
    else if (tx.type === "sell") eraSells += amount;
    else if (tx.type === "contribution") eraContributions += amount;
  }

  eraBuys = money(eraBuys);
  eraSells = money(eraSells);
  eraContributions = money(eraContributions);
  const eraNetDeployed = money(eraBuys - eraSells);
  const eraCash = money(era.reference_total_capital + eraContributions - eraNetDeployed);

  return {
    referenceTotalCapital: money(era.reference_total_capital),
    sleeveCap: money(era.reference_total_capital * 0.20),
    eraBuys,
    eraSells,
    eraContributions,
    eraNetDeployed,
    eraCash,
  };
}
