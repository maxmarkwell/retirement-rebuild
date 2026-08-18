export type PortfolioRecord = {
  id: string;
  starting_capital: number | string;
};

export type ContributionRecord = {
  portfolio_id: string;
  amount: number | string;
};

export type TransactionRecord = {
  portfolio_id: string;
  transaction_type: string;
  ticker: string | null;
  quantity: number | string | null;
  gross_amount: number | string | null;
  fees: number | string | null;
};

export type DerivedHolding = {
  ticker: string;
  quantity: number;
  totalCost: number;
  averageCost: number;
  realizedGainLoss: number;
};

export type PortfolioAccounting = {
  contributionsTotal: number;
  cash: number;
  holdingsAtCost: number;
  realizedGainLoss: number;
  investmentGrowth: number;
  permanentCapital: number;
  holdings: DerivedHolding[];
};

export function calculatePortfolioAccounting(
  portfolio: PortfolioRecord,
  contributions: ContributionRecord[],
  transactions: TransactionRecord[]
): PortfolioAccounting {
  const contributionsTotal = contributions
    .filter(
      (contribution) =>
        contribution.portfolio_id === portfolio.id
    )
    .reduce(
      (total, contribution) =>
        total + Number(contribution.amount),
      0
    );

  let totalBuys = 0;
  let totalSellProceeds = 0;

  const holdingsMap = new Map<string, DerivedHolding>();

  const portfolioTransactions = transactions.filter(
    (transaction) =>
      transaction.portfolio_id === portfolio.id
  );

  portfolioTransactions.forEach((transaction) => {
    const grossAmount =
      Number(transaction.gross_amount ?? 0);

    const fees =
      Number(transaction.fees ?? 0);

    if (transaction.transaction_type === "buy") {
      totalBuys += grossAmount + fees;
    }

    if (transaction.transaction_type === "sell") {
      totalSellProceeds += grossAmount - fees;
    }

    if (
      !transaction.ticker ||
      transaction.quantity == null
    ) {
      return;
    }

    if (
      transaction.transaction_type !== "buy" &&
      transaction.transaction_type !== "sell"
    ) {
      return;
    }

    const ticker = transaction.ticker;
    const quantity = Number(transaction.quantity);

    const existing =
      holdingsMap.get(ticker) ?? {
        ticker,
        quantity: 0,
        totalCost: 0,
        averageCost: 0,
        realizedGainLoss: 0,
      };

    if (transaction.transaction_type === "buy") {
      const purchaseCost =
        grossAmount + fees;

      const newQuantity =
        existing.quantity + quantity;

      const newTotalCost =
        existing.totalCost + purchaseCost;

      holdingsMap.set(ticker, {
        ticker,
        quantity: newQuantity,
        totalCost: newTotalCost,
        averageCost:
          newQuantity > 0
            ? newTotalCost / newQuantity
            : 0,
        realizedGainLoss:
          existing.realizedGainLoss,
      });
    }

    if (transaction.transaction_type === "sell") {
      if (existing.quantity <= 0) {
        return;
      }

      const averageCost =
        existing.totalCost / existing.quantity;

      const costBasisRemoved =
        averageCost * quantity;

      const netSaleProceeds =
        grossAmount - fees;

      const realizedGainLoss =
        netSaleProceeds - costBasisRemoved;

      const newQuantity =
        existing.quantity - quantity;

      const newTotalCost =
        Math.max(
          0,
          existing.totalCost - costBasisRemoved
        );

      holdingsMap.set(ticker, {
        ticker,
        quantity: newQuantity,
        totalCost:
          newQuantity > 0
            ? newTotalCost
            : 0,
        averageCost:
          newQuantity > 0
            ? newTotalCost / newQuantity
            : 0,
        realizedGainLoss:
          existing.realizedGainLoss +
          realizedGainLoss,
      });
    }
  });

  const holdings = Array.from(
    holdingsMap.values()
  ).filter(
    (holding) =>
      holding.quantity > 0.00000001
  );

  const holdingsAtCost = holdings.reduce(
    (total, holding) =>
      total + holding.totalCost,
    0
  );

  const realizedGainLoss = Array.from(
    holdingsMap.values()
  ).reduce(
    (total, holding) =>
      total + holding.realizedGainLoss,
    0
  );

  const startingCapital =
    Number(portfolio.starting_capital);

  const cash =
    startingCapital +
    contributionsTotal -
    totalBuys +
    totalSellProceeds;

  const permanentCapital =
    cash + holdingsAtCost;

  const investmentGrowth =
    permanentCapital -
    startingCapital -
    contributionsTotal;

  return {
    contributionsTotal,
    cash,
    holdingsAtCost,
    realizedGainLoss,
    investmentGrowth,
    permanentCapital,
    holdings,
  };
}