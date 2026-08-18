export type MarketQuote = {
  symbol: string;
  name: string | null;
  price: number;
  previousClose: number | null;
  change: number | null;
  percentChange: number | null;
  timestamp: number | null;
  isMarketOpen: boolean | null;
};