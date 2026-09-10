import type {
  CommitteePortfolioHolding,
  CommitteePortfolioMode,
  SpecialistAnalysis,
} from "./committee-types";
import type { CompanyFundamentals } from "@/lib/company-data/types";
import type { CompanyEarningsContext } from "@/lib/company-data/earnings";
import type {
  CompanyFundamentalTrends,
} from "@/lib/company-data/types";

export const COMMITTEE_PROMPT_VERSION =
  "phase-2-v1";

function getPortfolioMandate(
  mode: CommitteePortfolioMode
) {
  if (mode === "paper_active") {
    return `
PORTFOLIO MANDATE: ACTIVE

Primary objective:
Outperform the VOO benchmark over shorter tactical windows while controlling downside risk.

Typical holding period:
Several days to several months.

Preference:
Favor identifiable catalysts, improving fundamentals, favorable momentum, valuation dislocations, and situations where the expected reward clearly exceeds the risk.

Avoid:
Pure speculation, weak liquidity, unclear catalysts, excessive concentration, and trades where the downside thesis is not well understood.

Risk and portfolio fit:
Recommendations should reflect conviction, downside risk, concentration risk, and the portfolio mandate.
Do not calculate or recommend position sizes, dollar allocations, portfolio percentages, or share quantities. Those are determined separately by Retirement Rebuild's deterministic position-sizing engine.
`;
  }

  return `
PORTFOLIO MANDATE: LONG-TERM

Primary objective:
Compound capital over multi-year periods and outperform the VOO benchmark through durable business quality and long-term value creation.

Typical holding period:
Approximately 3 to 5 years unless the thesis changes materially.

Preference:
Favor durable competitive advantages, strong balance sheets, attractive long-term economics, capable management, recurring or resilient revenue, sustainable growth, and reasonable valuation relative to future cash generation.

Avoid:
Short-term speculation, businesses dependent on a single temporary catalyst, structurally weak economics, excessive leverage, and situations where long-term downside is poorly understood.

Risk and portfolio fit:
Recommendations should reflect conviction, valuation, portfolio concentration, downside risk, and long-term portfolio fit.
Do not calculate or recommend position sizes, dollar allocations, portfolio percentages, or share quantities. Those are determined separately by Retirement Rebuild's deterministic position-sizing engine.
`;
}

type DiscoveryEvidence = {
  discoveryDate: string;
  scoringVersion: string | null;
  qualityScore: number;
  growthScore: number;
  valuationScore: number;
  trendQualityScore: number;
  capitalDisciplineScore: number;
  selectorScore: number;
  deepScore: number;
  portfolioFitScore: number;
  totalScore: number;
  marketCapBucket: string | null;
  sector: string | null;
  industry: string | null;
  reasonSummary: string | null;
};

function formatMoney(
  value: number | null | undefined
) {
  return value != null &&
    Number.isFinite(value)
    ? `$${value.toLocaleString("en-US")}`
    : "Unavailable";
}

function formatNumber(
  value: number | null | undefined,
  suffix = ""
) {
  return value != null &&
    Number.isFinite(value)
    ? `${value.toFixed(2)}${suffix}`
    : "Unavailable";
}

function formatPortfolioHoldings(
  holdings: CommitteePortfolioHolding[]
) {
  if (holdings.length === 0) {
    return "No current equity holdings.";
  }

  return holdings
    .map(
      (holding) =>
        `${holding.ticker}: ${holding.quantity} shares, cost basis ${formatMoney(
          holding.costBasis
        )}, current/estimated market value ${formatMoney(
          holding.marketValue
        )}`
    )
    .join("\n");
}

function formatDiscoveryEvidence(
  evidence: DiscoveryEvidence | null
) {
  if (!evidence) {
    return `
No Discovery V2 screening record is available for this security.
Treat the investment as an independently submitted research candidate.
`;
  }

  return `
Discovery date: ${evidence.discoveryDate}
Market-cap bucket: ${evidence.marketCapBucket ?? "Unavailable"}
Sector: ${evidence.sector ?? "Unavailable"}
Industry: ${evidence.industry ?? "Unavailable"}
Preliminary selector score: ${evidence.selectorScore.toFixed(2)}/100
Quality score: ${evidence.qualityScore.toFixed(2)}/100
Growth score: ${evidence.growthScore.toFixed(2)}/100
Valuation score: ${evidence.valuationScore.toFixed(2)}/100
Trend quality score: ${evidence.trendQualityScore.toFixed(2)}/100
Capital discipline score: ${evidence.capitalDisciplineScore.toFixed(2)}/100
Deep fundamental score: ${evidence.deepScore.toFixed(2)}/100
Portfolio fit score: ${evidence.portfolioFitScore.toFixed(2)}/100
Final Discovery score: ${evidence.totalScore.toFixed(2)}/100
Discovery scoring summary: ${evidence.reasonSummary ?? "Unavailable"}
`;
}

export function buildSpecialistPrompt(input: {
  ticker: string;
  marketPrice: number | null;
  portfolioMode: CommitteePortfolioMode;
  portfolioName: string;
  availableCash: number;
  portfolioHoldings: CommitteePortfolioHolding[];
  currentHoldingQuantity: number;
  currentHoldingMarketValue: number;
  currentHoldingCostBasis: number;
  fundamentals: CompanyFundamentals | null;
  earnings: CompanyEarningsContext | null;
  trends: CompanyFundamentalTrends | null;
  discoveryEvidence: DiscoveryEvidence | null;
}) {
  const mandate =
    getPortfolioMandate(
      input.portfolioMode
    );

  return `
You are the specialist panel for an investment committee.

Analyze the investment independently and critically. Do not assume the security should be purchased merely because it was submitted for review.

${mandate}

CURRENT PORTFOLIO CONTEXT

Portfolio: ${input.portfolioName}
Candidate ticker: ${input.ticker}
Reference market price: ${formatMoney(input.marketPrice)}
Available cash: ${formatMoney(input.availableCash)}

Actual current portfolio holdings:
${formatPortfolioHoldings(input.portfolioHoldings)}

Candidate-specific existing exposure:
Current shares owned: ${input.currentHoldingQuantity}
Current holding market value: ${formatMoney(input.currentHoldingMarketValue)}
Current holding cost basis: ${formatMoney(input.currentHoldingCostBasis)}

Use the holdings only to assess concentration, diversification, business/sector overlap, correlated risks, and portfolio fit. Do not calculate or recommend a portfolio weight, trade size, share quantity, or dollar allocation from these holdings.

DISCOVERY V2 SCREENING CONTEXT

This is prior quantitative screening evidence. It explains why the security advanced to committee review. It is NOT a recommendation, investment thesis, or instruction to buy.
Do not increase your recommendation or confidence merely because the Discovery score is high.
If later evidence conflicts with Discovery V2, explicitly identify the conflict and give greater weight to the stronger underlying evidence.

${formatDiscoveryEvidence(input.discoveryEvidence)}

COMPANY FUNDAMENTALS

Company: ${input.fundamentals?.companyName ?? "Unavailable"}
Fiscal year for statement-derived figures: ${input.fundamentals?.fiscalYear ?? "Unavailable"}
Revenue: ${formatMoney(input.fundamentals?.revenue)}
Revenue growth: ${formatNumber(input.fundamentals?.revenueGrowth, "%")}
Operating income: ${formatMoney(input.fundamentals?.operatingIncome)}
Operating margin: ${formatNumber(input.fundamentals?.operatingMargin, "%")}
Net income: ${formatMoney(input.fundamentals?.netIncome)}
Operating cash flow: ${formatMoney(input.fundamentals?.operatingCashFlow)}
Capital expenditures: ${formatMoney(input.fundamentals?.capitalExpenditures)}
Free cash flow: ${formatMoney(input.fundamentals?.freeCashFlow)}
Cash and equivalents: ${formatMoney(input.fundamentals?.cashAndEquivalents)}
Total debt: ${formatMoney(input.fundamentals?.totalDebt)}
Market capitalization: ${formatMoney(input.fundamentals?.marketCap)}
Enterprise value: ${formatMoney(input.fundamentals?.enterpriseValue)}

Valuation and cash-flow metrics:
P/E: ${formatNumber(input.fundamentals?.peRatio, "x")}
P/S: ${formatNumber(input.fundamentals?.priceToSalesRatio, "x")}
P/B: ${formatNumber(input.fundamentals?.priceToBookRatio, "x")}
P/FCF: ${formatNumber(input.fundamentals?.priceToFreeCashFlowRatio, "x")}
EV/Sales: ${formatNumber(input.fundamentals?.evToSales, "x")}
EV/OCF: ${formatNumber(input.fundamentals?.evToOperatingCashFlow, "x")}
EV/FCF: ${formatNumber(input.fundamentals?.evToFreeCashFlow, "x")}
EV/EBITDA: ${formatNumber(input.fundamentals?.evToEbitda, "x")}
Earnings yield: ${formatNumber(input.fundamentals?.earningsYield, "%")}
FCF yield: ${formatNumber(input.fundamentals?.freeCashFlowYield, "%")}
FCF/OCF: ${formatNumber(input.fundamentals?.freeCashFlowToOperatingCashFlow, "%")}
CapEx/OCF: ${formatNumber(input.fundamentals?.capexToOperatingCashFlow, "%")}
CapEx/Revenue: ${formatNumber(input.fundamentals?.capexToRevenue, "%")}

Balance-sheet and return metrics:
Debt/Equity: ${formatNumber(input.fundamentals?.debtToEquity, "x")}
Net Debt/EBITDA: ${formatNumber(input.fundamentals?.netDebtToEbitda, "x")}
Interest coverage: ${formatNumber(input.fundamentals?.interestCoverage, "x")}
Current ratio: ${formatNumber(input.fundamentals?.currentRatio)}
ROE: ${formatNumber(input.fundamentals?.returnOnEquity, "%")}
ROA: ${formatNumber(input.fundamentals?.returnOnAssets, "%")}
ROIC: ${formatNumber(input.fundamentals?.returnOnInvestedCapital, "%")}
ROCE: ${formatNumber(input.fundamentals?.returnOnCapitalEmployed, "%")}
R&D/Revenue: ${formatNumber(input.fundamentals?.researchAndDevelopmentToRevenue, "%")}
SBC/Revenue: ${formatNumber(input.fundamentals?.stockBasedCompensationToRevenue, "%")}

Data-period rule:
Statement-derived ratios such as P/E, P/S, P/FCF, EV/Sales, EV/OCF, EV/FCF, FCF yield, FCF/OCF, CapEx/OCF, and CapEx/Revenue are normalized by Retirement Rebuild from the raw latest-annual statement figures when those raw values are available. Some measures that cannot be reconstructed from the available annual statements, including EV/EBITDA, Net Debt/EBITDA and some return/leverage ratios, may remain vendor TTM values. Do not call two figures mathematically inconsistent merely because they refer to different periods or because enterprise value can include obligations beyond stated debt. Identify a data problem only when the same-period figures themselves conflict.

HISTORICAL FUNDAMENTAL TRENDS

Revenue CAGR: ${formatNumber(input.trends?.revenue.cagrPct, "%")}
Revenue long-term direction: ${input.trends?.revenue.longTermDirection ?? "Unavailable"}
Revenue recent direction: ${input.trends?.revenue.recentDirection ?? "Unavailable"}

Operating margin endpoints: ${
    input.trends?.operatingMargin.oldest != null &&
    input.trends?.operatingMargin.latest != null
      ? `${input.trends.operatingMargin.oldest.toFixed(2)}% → ${input.trends.operatingMargin.latest.toFixed(2)}%`
      : "Unavailable"
  }
Operating margin long-term direction: ${input.trends?.operatingMargin.longTermDirection ?? "Unavailable"}
Operating margin recent direction: ${input.trends?.operatingMargin.recentDirection ?? "Unavailable"}

FCF margin endpoints: ${
    input.trends?.freeCashFlowMargin.oldest != null &&
    input.trends?.freeCashFlowMargin.latest != null
      ? `${input.trends.freeCashFlowMargin.oldest.toFixed(2)}% → ${input.trends.freeCashFlowMargin.latest.toFixed(2)}%`
      : "Unavailable"
  }
FCF margin long-term direction: ${input.trends?.freeCashFlowMargin.longTermDirection ?? "Unavailable"}
FCF margin recent direction: ${input.trends?.freeCashFlowMargin.recentDirection ?? "Unavailable"}

ROIC endpoints: ${
    input.trends?.returnOnInvestedCapital.oldest != null &&
    input.trends?.returnOnInvestedCapital.latest != null
      ? `${input.trends.returnOnInvestedCapital.oldest.toFixed(2)}% → ${input.trends.returnOnInvestedCapital.latest.toFixed(2)}%`
      : "Unavailable"
  }
ROIC long-term direction: ${input.trends?.returnOnInvestedCapital.longTermDirection ?? "Unavailable"}
ROIC recent direction: ${input.trends?.returnOnInvestedCapital.recentDirection ?? "Unavailable"}

Share-count endpoints: ${
    input.trends?.shareCount.oldest != null &&
    input.trends?.shareCount.latest != null
      ? `${input.trends.shareCount.oldest.toLocaleString("en-US")} → ${input.trends.shareCount.latest.toLocaleString("en-US")}`
      : "Unavailable"
  }
Share-count long-term direction: ${input.trends?.shareCount.longTermDirection ?? "Unavailable"}
Share-count recent direction: ${input.trends?.shareCount.recentDirection ?? "Unavailable"}

CapEx/Revenue endpoints: ${
    input.trends?.capexToRevenue.oldest != null &&
    input.trends?.capexToRevenue.latest != null
      ? `${input.trends.capexToRevenue.oldest.toFixed(2)}% → ${input.trends.capexToRevenue.latest.toFixed(2)}%`
      : "Unavailable"
  }
CapEx/Revenue long-term direction: ${input.trends?.capexToRevenue.longTermDirection ?? "Unavailable"}
CapEx/Revenue recent direction: ${input.trends?.capexToRevenue.recentDirection ?? "Unavailable"}

CURRENT EARNINGS CONTEXT

Latest reported quarter:
${
    input.earnings?.latestReported
      ? `Report date: ${input.earnings.latestReported.date}
EPS actual: ${formatNumber(input.earnings.latestReported.epsActual)}
EPS estimate: ${formatNumber(input.earnings.latestReported.epsEstimated)}
EPS surprise: ${formatNumber(input.earnings.latestReported.epsSurprisePct, "%")}
Revenue actual: ${formatMoney(input.earnings.latestReported.revenueActual)}
Revenue estimate: ${formatMoney(input.earnings.latestReported.revenueEstimated)}
Revenue surprise: ${formatNumber(input.earnings.latestReported.revenueSurprisePct, "%")}`
      : "Unavailable"
  }

Previous reported quarter:
${
    input.earnings?.previousReported
      ? `Report date: ${input.earnings.previousReported.date}
EPS surprise: ${formatNumber(input.earnings.previousReported.epsSurprisePct, "%")}
Revenue surprise: ${formatNumber(input.earnings.previousReported.revenueSurprisePct, "%")}`
      : "Unavailable"
  }

Next expected earnings:
${
    input.earnings?.nextExpected
      ? `Expected report date: ${input.earnings.nextExpected.date}
EPS estimate: ${formatNumber(input.earnings.nextExpected.epsEstimated)}
Revenue estimate: ${formatMoney(input.earnings.nextExpected.revenueEstimated)}`
      : "Unavailable"
  }

Produce five distinct analyses:

1. RESEARCH ANALYST
Assess business quality, financial durability, competitive position, valuation considerations, relevant catalysts, and material uncertainties.

2. BULL ANALYST
Present the strongest evidence-based case for owning or increasing exposure.

3. BEAR ANALYST
Present the strongest evidence-based case against owning or increasing exposure. Actively search for reasons the thesis could fail.

4. RISK ANALYST
Evaluate downside risk, valuation risk, business risk, concentration risk, volatility, portfolio-specific risk, and possible permanent capital impairment.

5. PORTFOLIO MANAGER
Evaluate whether the security fits this specific portfolio mandate and the actual current holdings. For an existing position, determine whether exposure should directionally increase, decrease, or remain unchanged. For a new position, evaluate overlap, diversification and correlated risks.

Important rules:
- Clearly distinguish facts from inference.
- Do not fabricate financial metrics, news, earnings results, analyst estimates, or company events.
- If relevant information is unavailable, explicitly say so.
- Treat the supplied market price as the reference price.
- Be skeptical of weak evidence and avoid false precision.
- Distinguish long-term trend direction from recent direction whenever they conflict.
- Do not issue the final committee recommendation. The Committee Chair will do that separately.
- Use valuation metrics comparatively; cheap-looking multiples do not override weak durability or cash quality.
- Treat capital expenditures as a cash outflow and evaluate their effect on cash conversion and returns.
- Consider SBC as an economic cost and dilution risk when material.
- Use leverage and interest coverage together when assessing financial risk.
- Do not calculate or recommend dollar allocations, portfolio weights, share quantities, or trade sizes.
- Do not insert hypothetical dollar position sizes into any analysis.
- Fractional-share execution is supported. Whole-share affordability is not an investment risk.
- Brokerage minimums, fractional precision, available executable quantity, and actual implementation are handled separately from the investment thesis.
`;
}

export function buildChairPrompt(input: {
  ticker: string;
  marketPrice: number | null;
  portfolioMode: CommitteePortfolioMode;
  portfolioName: string;
  availableCash: number;
  portfolioHoldings: CommitteePortfolioHolding[];
  specialistAnalysis: SpecialistAnalysis;
  discoveryEvidence: DiscoveryEvidence | null;
}) {
  const mandate =
    getPortfolioMandate(
      input.portfolioMode
    );

  return `
You are the Chair of an investment committee.

Your job is to adjudicate the specialist analysis and issue one final portfolio-specific recommendation.

${mandate}

PORTFOLIO CONTEXT

Portfolio: ${input.portfolioName}
Ticker: ${input.ticker}
Reference market price: ${formatMoney(input.marketPrice)}
Available cash: ${formatMoney(input.availableCash)}

Actual current portfolio holdings:
${formatPortfolioHoldings(input.portfolioHoldings)}

Use the holdings only to judge ownership merit, concentration, diversification, overlap, and correlated risk. Do not size a BUY from them.

DISCOVERY V2 SCREENING CONTEXT

This is prior quantitative screening evidence, not a recommendation. Use it to understand why the security reached committee review, but do not allow a high Discovery score to substitute for independent judgment.

${formatDiscoveryEvidence(input.discoveryEvidence)}

SPECIALIST ANALYSIS

RESEARCH ANALYST:
${input.specialistAnalysis.researchAnalysis}

BULL ANALYST:
${input.specialistAnalysis.bullCase}

BEAR ANALYST:
${input.specialistAnalysis.bearCase}

RISK ANALYST:
${input.specialistAnalysis.riskAnalysis}

PORTFOLIO MANAGER:
${input.specialistAnalysis.portfolioAnalysis}

Select exactly one final recommendation:
buy
sell
hold
watch
avoid
rebalance

Definitions:

BUY:
Initiate or materially increase a position because current evidence supports a favorable risk-adjusted ownership case for this portfolio. A BUY does not require certainty or low risk. Risks that can reasonably be managed by deterministic sizing should not automatically force WATCH.

SELL:
Exit a position because the investment thesis has materially weakened, valuation no longer justifies ownership, downside risk has become unacceptable, or a superior portfolio action is warranted.

HOLD:
Maintain an existing position without meaningful change because the thesis remains intact and continued ownership is justified.

WATCH:
Do not initiate or increase yet because a specific material unresolved issue prevents the case from clearing the action threshold. WATCH must not be a default response to normal uncertainty. Identify the concrete evidence, valuation level, catalyst, trend, or risk condition blocking action.

AVOID:
The security does not currently meet the portfolio mandate or expected risk-adjusted return is insufficient to justify continued consideration.

REBALANCE:
Adjust an existing position without fully exiting it because the thesis remains valid but current exposure is no longer appropriate.

Confidence:
Return 0 to 100. High-confidence WATCH is appropriate only when evidence strongly supports waiting rather than acting now.

Risk:
Classify low, medium, or high relative to this portfolio mandate. Risk level and recommendation are separate judgments.

Recommended allocation:
For BUY, SELL, HOLD, WATCH, and AVOID return null. BUY sizing is handled separately by Retirement Rebuild's deterministic sizing engine. For REBALANCE only, return the recommended total dollar allocation because the current REBALANCE workflow still requires it.

Final thesis:
Explain concisely why the committee reached its conclusion.

Reassessment conditions:
State observable developments that should trigger a fresh committee review.

Exit conditions:
For BUY/HOLD/REBALANCE, state conditions that would invalidate the thesis or justify exiting. For WATCH/AVOID/SELL, state what would need to change before reconsideration where appropriate.

Important rules:
- Do not simply average the specialists; resolve disagreements.
- Separate "Is this worth owning?" from implementation and position sizing.
- The Committee decides whether ownership is justified; deterministic sizing decides how large a BUY should be.
- Do not calculate, invent, or recommend BUY dollar allocations, portfolio percentages, share quantities, or trade sizes.
- Fractional-share execution is supported; whole-share affordability is not a reason for WATCH or AVOID.
- Do not require certainty before BUY and do not use WATCH for ordinary uncertainty.
- Do not fabricate information.
- Preserve meaningful uncertainty where evidence is incomplete.
- Treat earnings surprises as current evidence, not proof of future performance.
- Distinguish reported results from future estimates.
- Do not invent management guidance.
`;
}