export type EarningsRecord = {
  symbol: string;
  date: string;

  epsActual: number | null;
  epsEstimated: number | null;

  revenueActual: number | null;
  revenueEstimated: number | null;

  lastUpdated: string | null;
};

export type EarningsEvent = EarningsRecord & {
  epsSurprisePct: number | null;
  revenueSurprisePct: number | null;
};

export type CompanyEarningsContext = {
  symbol: string;

  latestReported: EarningsEvent | null;
  previousReported: EarningsEvent | null;
  nextExpected: EarningsEvent | null;
};

type FmpEarningsRecord = {
  symbol?: string;
  date?: string;

  epsActual?: number | null;
  epsEstimated?: number | null;

  revenueActual?: number | null;
  revenueEstimated?: number | null;

  lastUpdated?: string | null;
};

function calculateSurprisePct(
  actual: number | null,
  estimated: number | null
): number | null {
  if (
    actual == null ||
    estimated == null ||
    estimated === 0
  ) {
    return null;
  }

  return (
    ((actual - estimated) /
      Math.abs(estimated)) *
    100
  );
}

function normalizeRecord(
  record: FmpEarningsRecord,
  fallbackSymbol: string
): EarningsEvent {
  const epsActual =
    record.epsActual ?? null;

  const epsEstimated =
    record.epsEstimated ?? null;

  const revenueActual =
    record.revenueActual ?? null;

  const revenueEstimated =
    record.revenueEstimated ?? null;

  return {
    symbol:
      record.symbol ??
      fallbackSymbol,

    date:
      record.date ??
      "",

    epsActual,
    epsEstimated,

    revenueActual,
    revenueEstimated,

    lastUpdated:
      record.lastUpdated ??
      null,

    epsSurprisePct:
      calculateSurprisePct(
        epsActual,
        epsEstimated
      ),

    revenueSurprisePct:
      calculateSurprisePct(
        revenueActual,
        revenueEstimated
      ),
  };
}

export async function getCompanyEarningsContext(
  symbol: string
): Promise<CompanyEarningsContext> {
  const apiKey =
    process.env.FMP_API_KEY;

  if (!apiKey) {
    throw new Error(
      "FMP_API_KEY is not configured."
    );
  }

  const normalizedSymbol =
    symbol
      .trim()
      .toUpperCase();

  const url = new URL(
    "https://financialmodelingprep.com/stable/earnings"
  );

  url.searchParams.set(
    "symbol",
    normalizedSymbol
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
      `FMP earnings request failed with status ${response.status}: ${text.slice(
        0,
        250
      )}`
    );
  }

  const data =
    (await response.json()) as FmpEarningsRecord[];

  const normalized =
    (data ?? [])
      .filter(
        (record) =>
          Boolean(
            record.date
          )
      )
      .map((record) =>
        normalizeRecord(
          record,
          normalizedSymbol
        )
      )
      .sort(
        (a, b) =>
          new Date(b.date).getTime() -
          new Date(a.date).getTime()
      );

  const now =
    new Date();

  const reported =
    normalized.filter(
      (record) =>
        record.epsActual != null ||
        record.revenueActual != null
    );

  const future =
    normalized
      .filter(
        (record) =>
          new Date(
            `${record.date}T23:59:59`
          ) > now &&
          record.epsActual == null &&
          record.revenueActual == null
      )
      .sort(
        (a, b) =>
          new Date(a.date).getTime() -
          new Date(b.date).getTime()
      );

  return {
    symbol:
      normalizedSymbol,

    latestReported:
      reported[0] ??
      null,

    previousReported:
      reported[1] ??
      null,

    nextExpected:
      future[0] ??
      null,
  };
}