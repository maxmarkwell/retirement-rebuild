import type {
  FundamentalScreenCandidate,
} from "./fundamental-screen";
import type {
  MarketCapBucket,
} from "./dynamic-universe";

export type DeepCandidateScore = {
  ticker: string;

  marketCapBucket:
    MarketCapBucket;

  score: number;

  components: {
    growth: number;
    profitability: number;
    roic: number;
    leverage: number;
    fcfYield: number;
  };
};

export type DeepCandidateSelection = {
  inputCount: number;
  selectedCount: number;

  bucketCounts: Record<
    MarketCapBucket,
    number
  >;

  selected: {
    candidate:
      FundamentalScreenCandidate;

    score:
      DeepCandidateScore;
  }[];
};

const TARGETS: Record<
  MarketCapBucket,
  number
> = {
  small: 25,
  mid: 30,
  large: 25,
  mega: 15,
};

function clamp(
  value: number
) {
  return Math.max(
    0,
    Math.min(100, value)
  );
}

function scoreGrowth(
  value: number | null
) {
  if (value == null) {
    return 40;
  }

  if (value >= 40) {
    return 100;
  }

  if (value >= 25) {
    return 90;
  }

  if (value >= 15) {
    return 80;
  }

  if (value >= 8) {
    return 70;
  }

  if (value >= 3) {
    return 60;
  }

  if (value >= 0) {
    return 50;
  }

  return clamp(
    50 + value * 2
  );
}

function scoreProfitability(
  value: number | null,
  bucket: MarketCapBucket
) {
  if (value == null) {
    return 40;
  }

  if (
    bucket === "small" ||
    bucket === "mid"
  ) {
    if (value >= 25) {
      return 100;
    }

    if (value >= 15) {
      return 90;
    }

    if (value >= 8) {
      return 80;
    }

    if (value >= 3) {
      return 70;
    }

    if (value >= 0) {
      return 60;
    }

    return clamp(
      60 + value * 2
    );
  }

  if (value >= 30) {
    return 100;
  }

  if (value >= 20) {
    return 90;
  }

  if (value >= 12) {
    return 80;
  }

  if (value >= 7) {
    return 70;
  }

  if (value >= 3) {
    return 60;
  }

  if (value >= 0) {
    return 50;
  }

  return 20;
}

function scoreRoic(
  value: number | null
) {
  if (value == null) {
    return 40;
  }

  /*
    Extremely large reported ROIC values can
    result from tiny or distorted invested-
    capital denominators.

    Treat them as anomalous rather than
    automatically awarding maximum quality.
  */

  if (
    !Number.isFinite(value) ||
    Math.abs(value) > 200
  ) {
    return 50;
  }

  if (value >= 25) {
    return 100;
  }

  if (value >= 18) {
    return 90;
  }

  if (value >= 12) {
    return 80;
  }

  if (value >= 8) {
    return 70;
  }

  if (value >= 4) {
    return 60;
  }

  if (value >= 0) {
    return 50;
  }

  return clamp(
    50 + value * 2
  );
}

function scoreLeverage(
  value: number | null
) {
  if (value == null) {
    return 50;
  }

  if (value < 0) {
    return 100;
  }

  if (value <= 1) {
    return 90;
  }

  if (value <= 2) {
    return 80;
  }

  if (value <= 3) {
    return 70;
  }

  if (value <= 4) {
    return 60;
  }

  if (value <= 5) {
    return 45;
  }

  return 25;
}

function scoreFcfYield(
  value: number | null
) {
  if (value == null) {
    return 40;
  }

  if (value >= 8) {
    return 100;
  }

  if (value >= 6) {
    return 90;
  }

  if (value >= 4) {
    return 80;
  }

  if (value >= 2.5) {
    return 70;
  }

  if (value >= 1) {
    return 55;
  }

  if (value >= 0) {
    return 40;
  }

  return 20;
}

function scoreCandidate(
  candidate:
    FundamentalScreenCandidate
): DeepCandidateScore {
  const {
    stock,
    fundamentals,
  } = candidate;

  const growth =
    scoreGrowth(
      fundamentals
        .revenueGrowthPct
    );

  const profitability =
    scoreProfitability(
      fundamentals
        .operatingMarginPct,
      stock.marketCapBucket
    );

  const roic =
    scoreRoic(
      fundamentals
        .returnOnInvestedCapitalPct
    );

  const leverage =
    scoreLeverage(
      fundamentals
        .netDebtToEbitda
    );

  const fcfYield =
    scoreFcfYield(
      fundamentals
        .freeCashFlowYieldPct
    );

  const total =
    growth * 0.25 +
    profitability * 0.2 +
    roic * 0.25 +
    leverage * 0.15 +
    fcfYield * 0.15;

  return {
    ticker:
      stock.ticker,

    marketCapBucket:
      stock.marketCapBucket,

    score:
      Number(
        total.toFixed(2)
      ),

    components: {
      growth,
      profitability,
      roic,
      leverage,
      fcfYield,
    },
  };
}

export function selectDeepCandidates(
  passed:
    FundamentalScreenCandidate[]
): DeepCandidateSelection {
  const buckets:
    MarketCapBucket[] = [
      "small",
      "mid",
      "large",
      "mega",
    ];

  const selected:
    DeepCandidateSelection["selected"] =
    [];

  for (
    const bucket
    of buckets
  ) {
    const target =
      TARGETS[bucket];

    const ranked =
      passed
        .filter(
          (candidate) =>
            candidate.stock
              .marketCapBucket ===
            bucket
        )
        .map(
          (candidate) => ({
            candidate,

            score:
              scoreCandidate(
                candidate
              ),
          })
        )
        .sort(
          (a, b) =>
            b.score.score -
            a.score.score
        )
        .slice(
          0,
          target
        );

    selected.push(
      ...ranked
    );
  }

  const bucketCounts:
    Record<
      MarketCapBucket,
      number
    > = {
      small: 0,
      mid: 0,
      large: 0,
      mega: 0,
    };

  for (
    const item
    of selected
  ) {
    bucketCounts[
      item.candidate.stock
        .marketCapBucket
    ] += 1;
  }

  return {
    inputCount:
      passed.length,

    selectedCount:
      selected.length,

    bucketCounts,

    selected:
      selected.sort(
        (a, b) =>
          b.score.score -
          a.score.score
      ),
  };
}