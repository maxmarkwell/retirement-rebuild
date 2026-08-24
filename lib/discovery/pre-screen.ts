import type {
  DynamicUniverseStock,
  MarketCapBucket,
} from "./dynamic-universe";

export type PreScreenResult = {
  inputCount: number;
  selectedCount: number;

  bucketCounts: Record<
    MarketCapBucket,
    number
  >;

  selected:
    DynamicUniverseStock[];
};

const TARGETS: Record<
  MarketCapBucket,
  number
> = {
  small: 100,
  mid: 100,
  large: 75,
  mega: 25,
};

const MIN_DOLLAR_VOLUME: Record<
  MarketCapBucket,
  number
> = {
  small: 1_000_000,
  mid: 2_000_000,
  large: 5_000_000,
  mega: 10_000_000,
};

function sectorCapForTarget(
  target: number
) {
  return Math.max(
    5,
    Math.ceil(
      target * 0.25
    )
  );
}

function qualityScore(
  stock: DynamicUniverseStock
) {
  let score = 0;

  const dollarVolume =
    stock.dollarVolume ?? 0;

  if (
    dollarVolume >=
    100_000_000
  ) {
    score += 30;
  } else if (
    dollarVolume >=
    25_000_000
  ) {
    score += 25;
  } else if (
    dollarVolume >=
    10_000_000
  ) {
    score += 20;
  } else if (
    dollarVolume >=
    5_000_000
  ) {
    score += 15;
  } else if (
    dollarVolume >=
    2_000_000
  ) {
    score += 10;
  } else {
    score += 5;
  }

  if (
    stock.exchangeShortName ===
    "NYSE"
  ) {
    score += 10;
  }

  if (
    stock.exchangeShortName ===
    "NASDAQ"
  ) {
    score += 10;
  }

  if (
    stock.sector
  ) {
    score += 5;
  }

  if (
    stock.industry
  ) {
    score += 5;
  }

  /*
    Mild preference for names with enough
    market cap to reduce extreme small-cap risk,
    while still preserving the bucket itself.
  */

  if (
    stock.marketCapBucket ===
    "small"
  ) {
    if (
      stock.marketCap >=
      1_000_000_000
    ) {
      score += 10;
    } else if (
      stock.marketCap >=
      500_000_000
    ) {
      score += 5;
    }
  }

  return score;
}

function selectBucket(
  stocks:
    DynamicUniverseStock[],
  bucket:
    MarketCapBucket
) {
  const target =
    TARGETS[bucket];

  const minimumDollarVolume =
    MIN_DOLLAR_VOLUME[
      bucket
    ];

  const sectorCap =
    sectorCapForTarget(
      target
    );

  const eligible =
    stocks
      .filter(
        (stock) =>
          stock.marketCapBucket ===
            bucket &&
          (
            stock.dollarVolume ??
            0
          ) >=
            minimumDollarVolume
      )
      .sort(
        (a, b) => {
          const scoreDifference =
            qualityScore(b) -
            qualityScore(a);

          if (
            scoreDifference !== 0
          ) {
            return scoreDifference;
          }

          return (
            b.marketCap -
            a.marketCap
          );
        }
      );

  const selected:
    DynamicUniverseStock[] =
    [];

  const sectorCounts =
    new Map<
      string,
      number
    >();

  /*
    First pass:
    maintain sector diversity.
  */

  for (
    const stock
    of eligible
  ) {
    if (
      selected.length >=
      target
    ) {
      break;
    }

    const sector =
      stock.sector ??
      "Unknown";

    const currentSectorCount =
      sectorCounts.get(
        sector
      ) ?? 0;

    if (
      currentSectorCount >=
      sectorCap
    ) {
      continue;
    }

    selected.push(
      stock
    );

    sectorCounts.set(
      sector,
      currentSectorCount +
        1
    );
  }

  /*
    Second pass:
    if sector caps prevented us from reaching
    the desired bucket size, fill remaining
    slots with the best eligible names.
  */

  if (
    selected.length <
    target
  ) {
    const selectedTickers =
      new Set(
        selected.map(
          (stock) =>
            stock.ticker
        )
      );

    for (
      const stock
      of eligible
    ) {
      if (
        selected.length >=
        target
      ) {
        break;
      }

      if (
        selectedTickers.has(
          stock.ticker
        )
      ) {
        continue;
      }

      selected.push(
        stock
      );

      selectedTickers.add(
        stock.ticker
      );
    }
  }

  return selected;
}

export function preScreenDynamicUniverse(
  stocks:
    DynamicUniverseStock[]
): PreScreenResult {
  const buckets:
    MarketCapBucket[] = [
      "small",
      "mid",
      "large",
      "mega",
    ];

  const selected =
    buckets.flatMap(
      (bucket) =>
        selectBucket(
          stocks,
          bucket
        )
    );

  const bucketCounts =
    buckets.reduce(
      (
        counts,
        bucket
      ) => {
        counts[bucket] =
          selected.filter(
            (stock) =>
              stock.marketCapBucket ===
              bucket
          ).length;

        return counts;
      },
      {
        small: 0,
        mid: 0,
        large: 0,
        mega: 0,
      } as Record<
        MarketCapBucket,
        number
      >
    );

  return {
    inputCount:
      stocks.length,

    selectedCount:
      selected.length,

    bucketCounts,

    selected,
  };
}