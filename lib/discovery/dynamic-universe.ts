export type MarketCapBucket =
  | "small"
  | "mid"
  | "large"
  | "mega";

export type DynamicUniverseStock = {
  ticker: string;
  companyName: string;

  marketCap: number;
  price: number;

  sector: string | null;
  industry: string | null;

  volume: number | null;
  dollarVolume: number | null;

  exchange: string | null;
  exchangeShortName: string | null;

  marketCapBucket:
    MarketCapBucket;
};

type FmpScreenerStock = {
  symbol?: string;
  companyName?: string;

  marketCap?: number;

  sector?: string;
  industry?: string;

  beta?: number;
  price?: number;
  volume?: number;

  exchange?: string;
  exchangeShortName?: string;

  country?: string;

  isEtf?: boolean;
  isFund?: boolean;
  isActivelyTrading?: boolean;
};

type UniverseBucketDefinition = {
  bucket: MarketCapBucket;
  minimumMarketCap: number;
  maximumMarketCap?: number;
};

const BUCKETS: UniverseBucketDefinition[] = [
  {
    bucket: "small",
    minimumMarketCap:
      300_000_000,
    maximumMarketCap:
      2_000_000_000,
  },
  {
    bucket: "mid",
    minimumMarketCap:
      2_000_000_000,
    maximumMarketCap:
      10_000_000_000,
  },
  {
    bucket: "large",
    minimumMarketCap:
      10_000_000_000,
    maximumMarketCap:
      200_000_000_000,
  },
  {
    bucket: "mega",
    minimumMarketCap:
      200_000_000_000,
  },
];

function isPrimaryUsExchange(
  exchangeShortName:
    string | null | undefined
) {
  return (
    exchangeShortName ===
      "NASDAQ" ||
    exchangeShortName ===
      "NYSE" ||
    exchangeShortName ===
      "AMEX"
  );
}

function looksLikeNonCommonEquity(
  stock: FmpScreenerStock
) {
  const name =
    stock.companyName
      ?.toLowerCase() ??
    "";

  /*
    Remove obvious securities that are not
    ordinary operating-company common equity.
  */

  const blockedTerms = [
    "warrant",
    "warrants",
    "rights",
    "units",
    "senior notes",
    "preferred stock",
    "depositary shares",
    "debenture",
    "bond",
  ];

  return blockedTerms.some(
    (term) =>
      name.includes(term)
  );
}

async function fetchBucket(
  definition:
    UniverseBucketDefinition
): Promise<FmpScreenerStock[]> {
  const apiKey =
    process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FMP_API_KEY is not configured."
    );
  }

  const url = new URL(
    "https://financialmodelingprep.com/stable/company-screener"
  );

  url.searchParams.set(
    "country",
    "US"
  );

  url.searchParams.set(
    "isEtf",
    "false"
  );

  url.searchParams.set(
    "isFund",
    "false"
  );

  url.searchParams.set(
    "isActivelyTrading",
    "true"
  );

  url.searchParams.set(
    "marketCapMoreThan",
    definition
      .minimumMarketCap
      .toString()
  );

  if (
    definition
      .maximumMarketCap != null
  ) {
    url.searchParams.set(
      "marketCapLowerThan",
      definition
        .maximumMarketCap
        .toString()
    );
  }

  /*
    Large enough to capture each bucket
    independently without allowing mega caps
    to crowd smaller companies out.
  */

  url.searchParams.set(
    "limit",
    "2000"
  );

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
      `FMP company screener failed for ${definition.bucket} caps with status ${response.status}: ${text.slice(
        0,
        250
      )}`
    );
  }

  return (
    await response.json()
  ) as FmpScreenerStock[];
}

function normalizeStock(
  stock: FmpScreenerStock,
  bucket: MarketCapBucket
): DynamicUniverseStock | null {
  const ticker =
    stock.symbol
      ?.trim()
      .toUpperCase();

  if (!ticker) {
    return null;
  }

  const marketCap =
    Number(
      stock.marketCap ?? 0
    );

  const price =
    Number(
      stock.price ?? 0
    );

  const volume =
    stock.volume != null
      ? Number(stock.volume)
      : null;

  if (
    !Number.isFinite(
      marketCap
    ) ||
    marketCap <
      300_000_000
  ) {
    return null;
  }

  /*
    Avoid penny-stock territory.
  */

  if (
    !Number.isFinite(
      price
    ) ||
    price < 5
  ) {
    return null;
  }

  /*
    Restrict V2 to primary listed U.S.
    exchanges. OTC can be revisited later
    with its own risk controls.
  */

  if (
    !isPrimaryUsExchange(
      stock.exchangeShortName
    )
  ) {
    return null;
  }

  if (
    stock.country !== "US"
  ) {
    return null;
  }

  if (
    stock.isEtf === true ||
    stock.isFund === true ||
    stock.isActivelyTrading ===
      false
  ) {
    return null;
  }

  /*
    Our generic scorer is not designed
    for banks, insurers or brokers yet.
  */

if (
  stock.sector ===
    "Financial Services" ||
  stock.sector ===
    "Real Estate"
) {
  return null;
}
  if (
    looksLikeNonCommonEquity(
      stock
    )
  ) {
    return null;
  }

  /*
    Initial liquidity floor.

    50,000 shares by itself isn't perfect,
    so also calculate dollar volume below.
  */

  if (
    volume != null &&
    volume < 50_000
  ) {
    return null;
  }

  const dollarVolume =
    volume != null
      ? volume * price
      : null;

  /*
    Avoid securities trading only tiny
    dollar amounts even if nominal share
    volume looks acceptable.
  */

  if (
    dollarVolume != null &&
    dollarVolume <
      1_000_000
  ) {
    return null;
  }

  return {
    ticker,

    companyName:
      stock.companyName ??
      ticker,

    marketCap,

    price,

    sector:
      stock.sector ??
      null,

    industry:
      stock.industry ??
      null,

    volume,

    dollarVolume,

    exchange:
      stock.exchange ??
      null,

    exchangeShortName:
      stock.exchangeShortName ??
      null,

    marketCapBucket:
      bucket,
  };
}

export async function getDynamicDiscoveryUniverse(): Promise<
  DynamicUniverseStock[]
> {
  const bucketResults =
    await Promise.all(
      BUCKETS.map(
        async (
          definition
        ) => ({
          definition,

          stocks:
            await fetchBucket(
              definition
            ),
        })
      )
    );

  const byTicker =
    new Map<
      string,
      DynamicUniverseStock
    >();

  for (
    const bucketResult
    of bucketResults
  ) {
    for (
      const stock
      of bucketResult.stocks
    ) {
      const normalized =
        normalizeStock(
          stock,
          bucketResult
            .definition.bucket
        );

      if (!normalized) {
        continue;
      }

      if (
        !byTicker.has(
          normalized.ticker
        )
      ) {
        byTicker.set(
          normalized.ticker,
          normalized
        );
      }
    }
  }

  return Array.from(
    byTicker.values()
  ).sort(
    (a, b) =>
      b.marketCap -
      a.marketCap
  );
}