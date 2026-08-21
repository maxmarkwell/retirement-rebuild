export type DiscoveryUniverseStock = {
  ticker: string;
  companyName: string;
  sector: string;
};

export const DISCOVERY_UNIVERSE: DiscoveryUniverseStock[] = [
  // Technology
  {
    ticker: "MSFT",
    companyName: "Microsoft",
    sector: "Technology",
  },
  {
    ticker: "AAPL",
    companyName: "Apple",
    sector: "Technology",
  },
  {
    ticker: "NVDA",
    companyName: "NVIDIA",
    sector: "Technology",
  },
  {
    ticker: "ORCL",
    companyName: "Oracle",
    sector: "Technology",
  },
  {
    ticker: "CRM",
    companyName: "Salesforce",
    sector: "Technology",
  },
  {
    ticker: "ADBE",
    companyName: "Adobe",
    sector: "Technology",
  },
  {
    ticker: "AMD",
    companyName: "AMD",
    sector: "Technology",
  },
  {
    ticker: "INTC",
    companyName: "Intel",
    sector: "Technology",
  },
  {
    ticker: "QCOM",
    companyName: "Qualcomm",
    sector: "Technology",
  },
  {
    ticker: "CSCO",
    companyName: "Cisco",
    sector: "Technology",
  },

  // Communication / Internet
  {
    ticker: "GOOGL",
    companyName: "Alphabet",
    sector: "Communication Services",
  },
  {
    ticker: "META",
    companyName: "Meta Platforms",
    sector: "Communication Services",
  },
  {
    ticker: "NFLX",
    companyName: "Netflix",
    sector: "Communication Services",
  },

  // Consumer
  {
    ticker: "AMZN",
    companyName: "Amazon",
    sector: "Consumer Discretionary",
  },
  {
    ticker: "WMT",
    companyName: "Walmart",
    sector: "Consumer Staples",
  },
  {
    ticker: "COST",
    companyName: "Costco",
    sector: "Consumer Staples",
  },
  {
    ticker: "HD",
    companyName: "Home Depot",
    sector: "Consumer Discretionary",
  },
  {
    ticker: "LOW",
    companyName: "Lowe's",
    sector: "Consumer Discretionary",
  },
  {
    ticker: "MCD",
    companyName: "McDonald's",
    sector: "Consumer Discretionary",
  },
  {
    ticker: "NKE",
    companyName: "Nike",
    sector: "Consumer Discretionary",
  },
  {
    ticker: "SBUX",
    companyName: "Starbucks",
    sector: "Consumer Discretionary",
  },

  // Consumer Staples
  {
    ticker: "KO",
    companyName: "Coca-Cola",
    sector: "Consumer Staples",
  },
  {
    ticker: "PEP",
    companyName: "PepsiCo",
    sector: "Consumer Staples",
  },
  {
    ticker: "PG",
    companyName: "Procter & Gamble",
    sector: "Consumer Staples",
  },

  // Healthcare
  {
    ticker: "LLY",
    companyName: "Eli Lilly",
    sector: "Healthcare",
  },
  {
    ticker: "JNJ",
    companyName: "Johnson & Johnson",
    sector: "Healthcare",
  },
  {
    ticker: "ABBV",
    companyName: "AbbVie",
    sector: "Healthcare",
  },
  {
    ticker: "MRK",
    companyName: "Merck",
    sector: "Healthcare",
  },
  {
    ticker: "TMO",
    companyName: "Thermo Fisher Scientific",
    sector: "Healthcare",
  },
  {
    ticker: "ABT",
    companyName: "Abbott Laboratories",
    sector: "Healthcare",
  },

  // Industrials
  {
    ticker: "CAT",
    companyName: "Caterpillar",
    sector: "Industrials",
  },
  {
    ticker: "GE",
    companyName: "GE Aerospace",
    sector: "Industrials",
  },
  {
    ticker: "HON",
    companyName: "Honeywell",
    sector: "Industrials",
  },
  {
    ticker: "UPS",
    companyName: "UPS",
    sector: "Industrials",
  },
  {
    ticker: "RTX",
    companyName: "RTX",
    sector: "Industrials",
  },
  {
    ticker: "DE",
    companyName: "Deere",
    sector: "Industrials",
  },

  // Energy
  {
    ticker: "XOM",
    companyName: "Exxon Mobil",
    sector: "Energy",
  },
  {
    ticker: "CVX",
    companyName: "Chevron",
    sector: "Energy",
  },
  {
    ticker: "COP",
    companyName: "ConocoPhillips",
    sector: "Energy",
  },

  // Utilities
  {
    ticker: "NEE",
    companyName: "NextEra Energy",
    sector: "Utilities",
  },
  {
    ticker: "SO",
    companyName: "Southern Company",
    sector: "Utilities",
  },

  // Payments
  //
  // Visa and Mastercard are intentionally included.
  // Although classified as financial companies, their
  // economics differ substantially from banks.
  {
    ticker: "V",
    companyName: "Visa",
    sector: "Payments",
  },
  {
    ticker: "MA",
    companyName: "Mastercard",
    sector: "Payments",
  },

  // Real Estate
  {
    ticker: "AMT",
    companyName: "American Tower",
    sector: "Real Estate",
  },
  {
    ticker: "PLD",
    companyName: "Prologis",
    sector: "Real Estate",
  },

  // Materials
  {
    ticker: "LIN",
    companyName: "Linde",
    sector: "Materials",
  },
  {
    ticker: "SHW",
    companyName: "Sherwin-Williams",
    sector: "Materials",
  },
];