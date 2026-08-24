import type {
  CompanyFundamentals,
  CompanyFundamentalTrends,
} from "@/lib/company-data/types";

export type DeepDiscoveryScore = {
  totalScore: number;

  components: {
    quality: number;
    growth: number;
    valuation: number;
    trendQuality: number;
    capitalDiscipline: number;
  };

  reasonSummary: string;
};

function clamp(
  value: number,
  min = 0,
  max = 100
) {
  return Math.max(
    min,
    Math.min(max, value)
  );
}

function round(
  value: number
) {
  return Number(
    value.toFixed(2)
  );
}

function scoreDirection(
  direction:
    | "improving"
    | "stable"
    | "deteriorating"
    | "mixed"
    | "unavailable"
) {
  switch (direction) {
    case "improving":
      return 90;

    case "stable":
      return 70;

    case "mixed":
      return 55;

    case "deteriorating":
      return 30;

    default:
      return 45;
  }
}

function scoreOperatingMargin(
  value: number | null
) {
  if (value == null) {
    return 45;
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

  if (value >= -10) {
    return 35;
  }

  return 15;
}

function scoreRoic(
  value: number | null
) {
  if (value == null) {
    return 45;
  }

  if (
    !Number.isFinite(value) ||
    Math.abs(value) > 200
  ) {
    return 45;
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

  if (value >= -10) {
    return 30;
  }

  return 15;
}

function scoreRevenueGrowth(
  value: number | null
) {
  if (value == null) {
    return 45;
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

  if (value >= -5) {
    return 40;
  }

  if (value >= -10) {
    return 30;
  }

  return 15;
}

function scoreRevenueCagr(
  value: number | null
) {
  if (value == null) {
    return 45;
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

  return 25;
}

function scoreFcfYield(
  value: number | null
) {
  if (value == null) {
    return 45;
  }

  if (
    !Number.isFinite(value) ||
    Math.abs(value) > 100
  ) {
    return 45;
  }

  if (value >= 10) {
    return 100;
  }

  if (value >= 7) {
    return 90;
  }

  if (value >= 5) {
    return 80;
  }

  if (value >= 3) {
    return 70;
  }

  if (value >= 2) {
    return 60;
  }

  if (value >= 1) {
    return 50;
  }

  if (value >= 0) {
    return 35;
  }

  return 15;
}

function scorePe(
  value: number | null
) {
  if (
    value == null ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 45;
  }

  if (value <= 12) {
    return 95;
  }

  if (value <= 18) {
    return 85;
  }

  if (value <= 25) {
    return 75;
  }

  if (value <= 35) {
    return 60;
  }

  if (value <= 50) {
    return 45;
  }

  return 25;
}

function scoreEvToFcf(
  value: number | null
) {
  if (
    value == null ||
    !Number.isFinite(value) ||
    value <= 0
  ) {
    return 45;
  }

  if (value <= 10) {
    return 100;
  }

  if (value <= 15) {
    return 90;
  }

  if (value <= 20) {
    return 80;
  }

  if (value <= 30) {
    return 65;
  }

  if (value <= 45) {
    return 45;
  }

  return 25;
}

function scoreLeverage(
  value: number | null
) {
  if (value == null) {
    return 50;
  }

  if (!Number.isFinite(value)) {
    return 45;
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

function scoreInterestCoverage(
  value: number | null
) {
  if (value == null) {
    return 50;
  }

  if (!Number.isFinite(value)) {
    return 45;
  }

  if (value >= 20) {
    return 100;
  }

  if (value >= 10) {
    return 90;
  }

  if (value >= 6) {
    return 80;
  }

  if (value >= 3) {
    return 65;
  }

  if (value >= 1.5) {
    return 45;
  }

  return 20;
}

function scoreShareCountTrend(
  trends: CompanyFundamentalTrends
) {
  const trend =
    trends.shareCount;

  if (
    trend.percentChange == null
  ) {
    return scoreDirection(
      trend.direction
    );
  }

  const change =
    trend.percentChange;

  /*
    Share-count increases represent dilution.
    Share-count reductions are generally
    shareholder friendly.
  */

  if (change <= -10) {
    return 100;
  }

  if (change <= -3) {
    return 90;
  }

  if (change < 3) {
    return 75;
  }

  if (change < 10) {
    return 60;
  }

  if (change < 25) {
    return 40;
  }

  if (change < 50) {
    return 20;
  }

  return 5;
}

function scoreCapexIntensity(
  fundamentals:
    CompanyFundamentals,
  trends:
    CompanyFundamentalTrends
) {
  const current =
    fundamentals.capexToRevenue;

  let currentScore = 55;

  if (current != null) {
    if (current <= 3) {
      currentScore = 95;
    } else if (current <= 7) {
      currentScore = 85;
    } else if (current <= 12) {
      currentScore = 75;
    } else if (current <= 20) {
      currentScore = 60;
    } else if (current <= 30) {
      currentScore = 40;
    } else {
      currentScore = 20;
    }
  }

  const trendScore =
    scoreDirection(
      trends.capexToRevenue.direction
    );

  return (
    currentScore * 0.6 +
    trendScore * 0.4
  );
}

export function scoreDeepDiscoveryCandidate(
  fundamentals:
    CompanyFundamentals,
  trends:
    CompanyFundamentalTrends
): DeepDiscoveryScore {
  // ---------------------------------------------------------
  // Quality
  // ---------------------------------------------------------

  const marginScore =
    scoreOperatingMargin(
      fundamentals.operatingMargin
    );

  const roicScore =
    scoreRoic(
      fundamentals
        .returnOnInvestedCapital
    );

  const leverageScore =
    scoreLeverage(
      fundamentals.netDebtToEbitda
    );

  const interestCoverageScore =
    scoreInterestCoverage(
      fundamentals.interestCoverage
    );

  const quality =
    marginScore * 0.3 +
    roicScore * 0.35 +
    leverageScore * 0.2 +
    interestCoverageScore * 0.15;

  // ---------------------------------------------------------
  // Growth
  // ---------------------------------------------------------

  const recentGrowthScore =
    scoreRevenueGrowth(
      fundamentals.revenueGrowth
    );

  const cagrScore =
    scoreRevenueCagr(
      trends.revenue.cagrPct
    );

  const growth =
    recentGrowthScore * 0.55 +
    cagrScore * 0.45;

  // ---------------------------------------------------------
  // Valuation
  // ---------------------------------------------------------

  const fcfYieldScore =
    scoreFcfYield(
      fundamentals.freeCashFlowYield
    );

  const peScore =
    scorePe(
      fundamentals.peRatio
    );

  const evFcfScore =
    scoreEvToFcf(
      fundamentals.evToFreeCashFlow
    );

  const valuation =
    fcfYieldScore * 0.4 +
    evFcfScore * 0.35 +
    peScore * 0.25;

  // ---------------------------------------------------------
  // Trend quality
  // ---------------------------------------------------------

  const revenueTrend =
    scoreDirection(
      trends.revenue.direction
    );

  const marginTrend =
    scoreDirection(
      trends.operatingMargin.direction
    );

  const fcfMarginTrend =
    scoreDirection(
      trends.freeCashFlowMargin.direction
    );

  const roicTrend =
    scoreDirection(
      trends.returnOnInvestedCapital
        .direction
    );

  const trendQuality =
    revenueTrend * 0.2 +
    marginTrend * 0.25 +
    fcfMarginTrend * 0.25 +
    roicTrend * 0.3;

  // ---------------------------------------------------------
  // Capital discipline
  // ---------------------------------------------------------

  const dilutionScore =
    scoreShareCountTrend(
      trends
    );

  const capexScore =
    scoreCapexIntensity(
      fundamentals,
      trends
    );

  const fcfConversionScore =
    fundamentals
      .freeCashFlowToOperatingCashFlow !=
    null
      ? clamp(
          fundamentals
            .freeCashFlowToOperatingCashFlow
        )
      : 50;

  const capitalDiscipline =
    dilutionScore * 0.45 +
    capexScore * 0.3 +
    fcfConversionScore * 0.25;

  // ---------------------------------------------------------
  // Total
  // ---------------------------------------------------------

  const totalScore =
    quality * 0.25 +
    growth * 0.2 +
    valuation * 0.2 +
    trendQuality * 0.2 +
    capitalDiscipline * 0.15;

  const components = {
    quality:
      round(quality),

    growth:
      round(growth),

    valuation:
      round(valuation),

    trendQuality:
      round(trendQuality),

    capitalDiscipline:
      round(
        capitalDiscipline
      ),
  };

  return {
    totalScore:
      round(totalScore),

    components,

    reasonSummary:
      `Quality ${components.quality}, ` +
      `growth ${components.growth}, ` +
      `valuation ${components.valuation}, ` +
      `trend quality ${components.trendQuality}, ` +
      `capital discipline ${components.capitalDiscipline}.`,
  };
}