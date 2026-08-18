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

export async function getMarketQuote(
  symbol: string
): Promise<MarketQuote> {
  const apiKey = process.env.TWELVE_DATA_API_KEY;

  if (!apiKey) {
    throw new Error("TWELVE_DATA_API_KEY is not configured.");
  }

  const normalizedSymbol = symbol.trim().toUpperCase();

  const url = new URL("https://api.twelvedata.com/quote");
  url.searchParams.set("symbol", normalizedSymbol);

  const response = await fetch(url, {
    headers: {
      Authorization: `apikey ${apiKey}`,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(
      `Twelve Data request failed with status ${response.status}.`
    );
  }

  const data =
    (await response.json()) as TwelveDataQuoteResponse;

  if (
    data.status === "error" ||
    data.code ||
    data.message
  ) {
    throw new Error(
      data.message ?? `Unable to retrieve quote for ${normalizedSymbol}.`
    );
  }

  if (!data.symbol || !data.close) {
    throw new Error(
      `Incomplete market data returned for ${normalizedSymbol}.`
    );
  }

  return {
    symbol: data.symbol,
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