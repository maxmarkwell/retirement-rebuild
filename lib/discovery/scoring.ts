import type { CompanyFundamentals } from "@/lib/company-data/types";
import type { CompanyEarningsContext } from "@/lib/company-data/earnings";
import type {
  DiscoveryCandidate,
  DiscoveryPortfolioMode,
} from "./types";

function clampScore(value: number) {
  return Math.max(0, Math.min(100, value));
}

function scale(
  value: number,
  minValue: number,
  maxValue: number,
  minScore: number,
  maxScore: number
) {
  if (value <= minValue) {
    return minScore;
  }

  if (value >= maxValue) {
    return maxScore;
  }

  const ratio =
    (value - minValue) /
    (maxValue - minValue);

  return (
    minScore +
    ratio * (maxScore - minScore)
  );
}

// ---------------------------------------------------------
// Quality
// ---------------------------------------------------------

function scoreQuality(
  fundamentals: CompanyFundamentals
) {
  const parts: number[] = [];

  if (fundamentals.operatingMargin != null) {
    parts.push(
      scale(
        fundamentals.operatingMargin,
        0,
        40,
        20,
        100
      )
    );
  }

  if (fundamentals.freeCashFlow != null) {
    parts.push(
      fundamentals.freeCashFlow > 0
        ? 90
        : 10
    );
  }

  if (fundamentals.returnOnEquity != null) {
    parts.push(
      scale(
        fundamentals.returnOnEquity,
        0,
        35,
        20,
        100
      )
    );
  }

  if (parts.length === 0) {
    return 50;
  }

  return clampScore(
    parts.reduce(
      (sum, value) => sum + value,
      0
    ) / parts.length
  );
}

// ---------------------------------------------------------
// Growth
// ---------------------------------------------------------

function scoreGrowth(
  fundamentals: CompanyFundamentals
) {
  const growth =
    fundamentals.revenueGrowth;

  if (growth == null) {
    return 50;
  }

  return clampScore(
    scale(
      growth,
      -10,
      30,
      10,
      100
    )
  );
}

// ---------------------------------------------------------
// Valuation
// ---------------------------------------------------------

function scoreValuation(
  fundamentals: CompanyFundamentals
) {
  const parts: number[] = [];

  if (
    fundamentals.freeCashFlowYield != null
  ) {
    parts.push(
      scale(
        fundamentals.freeCashFlowYield,
        1,
        8,
        10,
        100
      )
    );
  }

  if (
    fundamentals.evToFreeCashFlow != null
  ) {
    parts.push(
      100 -
        scale(
          fundamentals.evToFreeCashFlow,
          15,
          70,
          10,
          90
        )
    );
  }

  if (
    fundamentals.evToEbitda != null
  ) {
    parts.push(
      100 -
        scale(
          fundamentals.evToEbitda,
          8,
          30,
          10,
          90
        )
    );
  }

  if (parts.length === 0) {
    return 50;
  }

  return clampScore(
    parts.reduce(
      (sum, value) => sum + value,
      0
    ) / parts.length
  );
}

// ---------------------------------------------------------
// Earnings
// ---------------------------------------------------------

function scoreEarnings(
  earnings: CompanyEarningsContext
) {
  const parts: number[] = [];

  const latest =
    earnings.latestReported;

  const previous =
    earnings.previousReported;

  if (
    latest?.epsSurprisePct != null
  ) {
    parts.push(
      scale(
        latest.epsSurprisePct,
        -10,
        15,
        10,
        100
      )
    );
  }

  if (
    latest?.revenueSurprisePct != null
  ) {
    parts.push(
      scale(
        latest.revenueSurprisePct,
        -5,
        8,
        10,
        100
      )
    );
  }

  if (
    previous?.epsSurprisePct != null
  ) {
    parts.push(
      scale(
        previous.epsSurprisePct,
        -10,
        15,
        10,
        100
      )
    );
  }

  if (
    previous?.revenueSurprisePct != null
  ) {
    parts.push(
      scale(
        previous.revenueSurprisePct,
        -5,
        8,
        10,
        100
      )
    );
  }

  if (parts.length === 0) {
    return 50;
  }

  return clampScore(
    parts.reduce(
      (sum, value) => sum + value,
      0
    ) / parts.length
  );
}

// ---------------------------------------------------------
// Risk
//
// Higher score = financially safer / lower risk.
// ---------------------------------------------------------

function scoreRisk(
  fundamentals: CompanyFundamentals
) {
  const parts: number[] = [];

  if (
    fundamentals.netDebtToEbitda != null
  ) {
    parts.push(
      100 -
        scale(
          fundamentals.netDebtToEbitda,
          0,
          4,
          0,
          90
        )
    );
  }

  if (
    fundamentals.operatingMargin != null
  ) {
    parts.push(
      scale(
        fundamentals.operatingMargin,
        0,
        35,
        20,
        100
      )
    );
  }

  if (
    fundamentals.freeCashFlow != null
  ) {
    parts.push(
      fundamentals.freeCashFlow > 0
        ? 90
        : 10
    );
  }

  if (parts.length === 0) {
    return 50;
  }

  return clampScore(
    parts.reduce(
      (sum, value) => sum + value,
      0
    ) / parts.length
  );
}

// ---------------------------------------------------------
// Main scorer
// ---------------------------------------------------------

export function scoreDiscoveryCandidate(
  input: {
    ticker: string;

    portfolioMode:
      DiscoveryPortfolioMode;

    fundamentals:
      CompanyFundamentals;

    earnings:
      CompanyEarningsContext;

    portfolioFitScore?: number;
  }
): DiscoveryCandidate {
  const quality =
    scoreQuality(
      input.fundamentals
    );

  const growth =
    scoreGrowth(
      input.fundamentals
    );

  const valuation =
    scoreValuation(
      input.fundamentals
    );

  const earnings =
    scoreEarnings(
      input.earnings
    );

  const risk =
    scoreRisk(
      input.fundamentals
    );

  const portfolioFit =
    clampScore(
      input.portfolioFitScore ??
        50
    );

  let totalScore: number;

  if (
    input.portfolioMode ===
    "paper_long_term"
  ) {
    totalScore =
      quality * 0.25 +
      growth * 0.20 +
      valuation * 0.20 +
      earnings * 0.10 +
      risk * 0.15 +
      portfolioFit * 0.10;
  } else {
    totalScore =
      quality * 0.15 +
      growth * 0.20 +
      valuation * 0.15 +
      earnings * 0.30 +
      risk * 0.10 +
      portfolioFit * 0.10;
  }

  const roundedScores = {
    quality:
      Number(quality.toFixed(2)),

    growth:
      Number(growth.toFixed(2)),

    valuation:
      Number(valuation.toFixed(2)),

    earnings:
      Number(earnings.toFixed(2)),

    risk:
      Number(risk.toFixed(2)),

    portfolioFit:
      Number(
        portfolioFit.toFixed(2)
      ),
  };

  totalScore =
    Number(
      totalScore.toFixed(2)
    );

  return {
    ticker:
      input.ticker
        .trim()
        .toUpperCase(),

    portfolioMode:
      input.portfolioMode,

    scores:
      roundedScores,

    totalScore,

    reasonSummary:
      `Quality ${roundedScores.quality}, growth ${roundedScores.growth}, valuation ${roundedScores.valuation}, earnings ${roundedScores.earnings}, risk ${roundedScores.risk}, portfolio fit ${roundedScores.portfolioFit}.`,
  };
}