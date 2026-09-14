import type { MarketQuote } from "./types";

type TwelveDataQuoteResponse = {
  symbol?: string;
  name?: string;
  close?: string;
  previous_close?: string;
  change?: string;
  percent_change?: string;
  timestamp?: number;
  is_market_open?: boolean;
  status?: string;
  code?: number;
  message?: string;
};

type TwelveDataBatchResponse =
  | TwelveDataQuoteResponse
  | Record<string, TwelveDataQuoteResponse>;

type CachedQuote = {
  quote: MarketQuote;
  expiresAt: number;
};

const QUOTE_CACHE_TTL_MS = 60_000;
const RATE_LIMIT_BACKOFF_MS = 15_000;

const quoteCache = new Map<string, CachedQuote>();
const inFlightQuotes = new Map<
  string,
  Promise<MarketQuote | null>
>();

let providerBackoffUntil = 0;
let providerBackoffMessage = "";

function normalizeQuote(
  data: TwelveDataQuoteResponse,
  fallbackSymbol: string
): MarketQuote | null {
  if (
    data.status === "error" ||
    data.code ||
    !data.close
  ) {
    return null;
  }

  return {
    symbol: data.symbol ?? fallbackSymbol,
    name: data.name ?? null,
    price: Number(data.close),
    previousClose:
      data.previous_close != null
        ? Number(data.previous_close)
        : null,
    change:
      data.change != null
        ? Number(data.change)
        : null,
    percentChange:
      data.percent_change != null
        ? Number(data.percent_change)
        : null,
    timestamp: data.timestamp ?? null,
    isMarketOpen: data.is_market_open ?? null,
  };
}

async function fetchMarketQuotesFromProvider(
  symbols: string[]
): Promise<Record<string, MarketQuote>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not configured.");
  }

  const now = Date.now();

  if (providerBackoffUntil > now) {
    throw new Error(
      providerBackoffMessage ||
        "Twelve Data is temporarily rate limited. Please try again shortly."
    );
  }

  const url = new URL("https://api.twelvedata.com/quote");

  url.searchParams.set("symbol", symbols.join(","));

  const response = await fetch(url, {
    headers: {
      Authorization: `apikey ${apiKey}`,
    },
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const message = `Twelve Data request failed with status ${response.status}: ${text.slice(
      0,
      300
    )}`;

    if (response.status === 429) {
      providerBackoffUntil = Date.now() + RATE_LIMIT_BACKOFF_MS;
      providerBackoffMessage = message;
    }

    throw new Error(message);
  }

  providerBackoffUntil = 0;
  providerBackoffMessage = "";

  const data =
    (await response.json()) as TwelveDataBatchResponse;

  const quotes: Record<string, MarketQuote> = {};

  // Single-symbol response
  if ("close" in data || "symbol" in data) {
    const symbol = symbols[0];

    const quote = normalizeQuote(
      data as TwelveDataQuoteResponse,
      symbol
    );

    if (quote) {
      quotes[symbol] = quote;
    }

    return quotes;
  }

  // Multi-symbol response
  for (const symbol of symbols) {
    const rawQuote =
      (data as Record<string, TwelveDataQuoteResponse>)[symbol];

    if (!rawQuote) {
      continue;
    }

    const quote = normalizeQuote(rawQuote, symbol);

    if (quote) {
      quotes[symbol] = quote;
    }
  }

  return quotes;
}

export async function getMarketQuotes(
  symbols: string[]
): Promise<Record<string, MarketQuote>> {
  const normalizedSymbols = Array.from(
    new Set(
      symbols
        .map((symbol) => symbol.trim().toUpperCase())
        .filter(Boolean)
    )
  );

  if (normalizedSymbols.length === 0) {
    return {};
  }

  const now = Date.now();
  const quotes: Record<string, MarketQuote> = {};
  const pending: Array<
    [string, Promise<MarketQuote | null>]
  > = [];
  const symbolsToFetch: string[] = [];

  for (const symbol of normalizedSymbols) {
    const cached = quoteCache.get(symbol);

    if (cached && cached.expiresAt > now) {
      quotes[symbol] = cached.quote;
      continue;
    }

    if (cached) {
      quoteCache.delete(symbol);
    }

    const inFlight = inFlightQuotes.get(symbol);

    if (inFlight) {
      pending.push([symbol, inFlight]);
      continue;
    }

    symbolsToFetch.push(symbol);
  }

  if (symbolsToFetch.length > 0) {
    const batchPromise =
      fetchMarketQuotesFromProvider(symbolsToFetch);

    for (const symbol of symbolsToFetch) {
      const promise = batchPromise
        .then((batchQuotes) => {
          const quote = batchQuotes[symbol] ?? null;

          if (quote) {
            quoteCache.set(symbol, {
              quote,
              expiresAt: Date.now() + QUOTE_CACHE_TTL_MS,
            });
          }

          return quote;
        })
        .finally(() => {
          inFlightQuotes.delete(symbol);
        });

      inFlightQuotes.set(symbol, promise);
      pending.push([symbol, promise]);
    }
  }

  const resolvedQuotes = await Promise.all(
    pending.map(async ([symbol, promise]) => [
      symbol,
      await promise,
    ] as const)
  );

  for (const [symbol, quote] of resolvedQuotes) {
    if (quote) {
      quotes[symbol] = quote;
    }
  }

  return quotes;
}

export async function getMarketQuote(
  symbol: string
): Promise<MarketQuote> {
  const normalizedSymbol = symbol.trim().toUpperCase();

  const quotes = await getMarketQuotes([normalizedSymbol]);

  const quote = quotes[normalizedSymbol];

  if (!quote) {
    throw new Error(
      `Unable to retrieve quote for ${normalizedSymbol}.`
    );
  }

  return quote;
}
