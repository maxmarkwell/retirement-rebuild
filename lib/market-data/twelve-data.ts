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

export async function getMarketQuotes(
  symbols: string[]
): Promise<Record<string, MarketQuote>> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not configured.");
  }

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

  const url = new URL("https://api.twelvedata.com/quote");

  url.searchParams.set(
    "symbol",
    normalizedSymbols.join(",")
  );

  const response = await fetch(url, {
    headers: {
      Authorization: `apikey ${apiKey}`,
    },
    next: {
      revalidate: 60,
    },
  });

  if (!response.ok) {
  const text =
    await response.text();

  throw new Error(
    `Twelve Data request failed with status ${response.status}: ${text.slice(
      0,
      300
    )}`
  );
}
  const data =
    (await response.json()) as TwelveDataBatchResponse;

  const quotes: Record<string, MarketQuote> = {};

  // Single-symbol response
  if ("close" in data || "symbol" in data) {
    const symbol = normalizedSymbols[0];

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
  for (const symbol of normalizedSymbols) {
    const rawQuote =
      (data as Record<string, TwelveDataQuoteResponse>)[
        symbol
      ];

    if (!rawQuote) {
      continue;
    }

    const quote = normalizeQuote(
      rawQuote,
      symbol
    );

    if (quote) {
      quotes[symbol] = quote;
    }
  }

  return quotes;
}

export async function getMarketQuote(
  symbol: string
): Promise<MarketQuote> {
  const normalizedSymbol =
    symbol.trim().toUpperCase();

  const quotes =
    await getMarketQuotes([normalizedSymbol]);

  const quote =
    quotes[normalizedSymbol];

  if (!quote) {
    throw new Error(
      `Unable to retrieve quote for ${normalizedSymbol}.`
    );
  }

  return quote;
}