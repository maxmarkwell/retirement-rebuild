import type {
  CommitteePortfolioMode,
  SpecialistAnalysis,
} from "./committee-types";
import type { CompanyFundamentals } from "@/lib/company-data/types";
import type { CompanyEarningsContext } from "@/lib/company-data/earnings";
import type {
  CompanyFundamentalTrends,
} from "@/lib/company-data/types";

export const COMMITTEE_PROMPT_VERSION =
  "phase-1-v1";

function getPortfolioMandate(
  mode: CommitteePortfolioMode
) {
  if (mode === "paper_active") {
    return `
PORTFOLIO MANDATE: AI ACTIVE

Primary objective:
Outperform the VOO benchmark over shorter tactical windows while controlling downside risk.

Typical holding period:
Several days to several months.

Preference:
Favor identifiable catalysts, improving fundamentals, favorable momentum, valuation dislocations, and situations where the expected reward clearly exceeds the risk.

Avoid:
Pure speculation, weak liquidity, unclear catalysts, excessive concentration, and trades where the downside thesis is not well understood.

Position sizing:
Recommendations should reflect conviction and risk. Do not recommend using all available cash simply because cash exists.
`;
  }

  return `
PORTFOLIO MANDATE: AI LONG-TERM

Primary objective:
Compound capital over multi-year periods and outperform the VOO benchmark through durable business quality and long-term value creation.

Typical holding period:
Approximately 3 to 5 years unless the thesis changes materially.

Preference:
Favor durable competitive advantages, strong balance sheets, attractive long-term economics, capable management, recurring or resilient revenue, sustainable growth, and reasonable valuation relative to future cash generation.

Avoid:
Short-term speculation, businesses dependent on a single temporary catalyst, structurally weak economics, excessive leverage, and situations where long-term downside is poorly understood.

Position sizing:
Recommendations should reflect conviction, valuation, portfolio concentration, and downside risk. Do not recommend using all available cash simply because cash exists.
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

export function buildSpecialistPrompt(input: {
  ticker: string;
  marketPrice: number | null;
  portfolioMode: CommitteePortfolioMode;
  portfolioName: string;
  availableCash: number;
  currentHoldingQuantity: number;
  currentHoldingMarketValue: number;
  currentHoldingCostBasis: number;
  fundamentals: CompanyFundamentals | null;
  earnings: CompanyEarningsContext | null;
  trends: CompanyFundamentalTrends | null;
  discoveryEvidence:
  DiscoveryEvidence | null;
}) {
  const mandate =
    getPortfolioMandate(
      input.portfolioMode
    );

  return `
You are the specialist panel for an investment committee.

You must analyze the investment independently and critically. Do not assume the security should be purchased merely because it was submitted for review.

${mandate}

CURRENT PORTFOLIO CONTEXT

Portfolio:
${input.portfolioName}

Ticker:
${input.ticker}

Current market price:
${
  input.marketPrice != null
    ? `$${input.marketPrice.toFixed(2)}`
    : "Unavailable"
}

Available cash:
$${input.availableCash.toFixed(2)}

Current shares owned:
${input.currentHoldingQuantity}

Current holding market value:
$${input.currentHoldingMarketValue.toFixed(2)}

Current holding cost basis:
$${input.currentHoldingCostBasis.toFixed(2)}

DISCOVERY V2 SCREENING CONTEXT

The information in this section is prior quantitative screening evidence.

It explains why the security advanced to committee review. It is NOT a recommendation, investment thesis, or instruction to buy.

You must independently evaluate the underlying fundamentals, trends, earnings evidence, valuation, risks, portfolio context, and competing interpretations.

Do not increase your recommendation or confidence merely because the Discovery score is high.

If later evidence conflicts with Discovery V2, explicitly identify the conflict and give greater weight to the stronger underlying evidence.

${
  input.discoveryEvidence
    ? `
Discovery date:
${input.discoveryEvidence.discoveryDate}

Market-cap bucket:
${input.discoveryEvidence.marketCapBucket ?? "Unavailable"}

Sector:
${input.discoveryEvidence.sector ?? "Unavailable"}

Industry:
${input.discoveryEvidence.industry ?? "Unavailable"}

Preliminary selector score:
${input.discoveryEvidence.selectorScore.toFixed(2)}/100

Quality score:
${input.discoveryEvidence.qualityScore.toFixed(2)}/100

Growth score:
${input.discoveryEvidence.growthScore.toFixed(2)}/100

Valuation score:
${input.discoveryEvidence.valuationScore.toFixed(2)}/100

Trend quality score:
${input.discoveryEvidence.trendQualityScore.toFixed(2)}/100

Capital discipline score:
${input.discoveryEvidence.capitalDisciplineScore.toFixed(2)}/100

Deep fundamental score:
${input.discoveryEvidence.deepScore.toFixed(2)}/100

Portfolio fit score:
${input.discoveryEvidence.portfolioFitScore.toFixed(2)}/100

Final Discovery score:
${input.discoveryEvidence.totalScore.toFixed(2)}/100

Discovery scoring summary:
${input.discoveryEvidence.reasonSummary ?? "Unavailable"}
`
    : `
No Discovery V2 screening record is available for this security.

Treat the investment as an independently submitted research candidate.
`
}

COMPANY FUNDAMENTALS

Company:
${input.fundamentals?.companyName ?? "Unavailable"}

Fiscal Year:
${input.fundamentals?.fiscalYear ?? "Unavailable"}

Revenue:
${
  input.fundamentals?.revenue != null
    ? `$${input.fundamentals.revenue.toLocaleString("en-US")}`
    : "Unavailable"
}

Enterprise Value:
${
  input.fundamentals?.enterpriseValue != null
    ? `$${input.fundamentals.enterpriseValue.toLocaleString("en-US")}`
    : "Unavailable"
}

HISTORICAL FUNDAMENTAL TRENDS

Revenue CAGR:
${
  input.trends?.revenue.cagrPct != null
    ? `${input.trends.revenue.cagrPct.toFixed(2)}%`
    : "Unavailable"
}

Revenue Direction:
${
  input.trends?.revenue.direction ??
  "Unavailable"
}

Operating Margin:
${
  input.trends?.operatingMargin.oldest != null &&
  input.trends?.operatingMargin.latest != null
    ? `${input.trends.operatingMargin.oldest.toFixed(
        2
      )}% → ${input.trends.operatingMargin.latest.toFixed(
        2
      )}%`
    : "Unavailable"
}

Operating Margin Direction:
${
  input.trends?.operatingMargin.direction ??
  "Unavailable"
}

Free Cash Flow Margin:
${
  input.trends?.freeCashFlowMargin.oldest != null &&
  input.trends?.freeCashFlowMargin.latest != null
    ? `${input.trends.freeCashFlowMargin.oldest.toFixed(
        2
      )}% → ${input.trends.freeCashFlowMargin.latest.toFixed(
        2
      )}%`
    : "Unavailable"
}

Free Cash Flow Margin Direction:
${
  input.trends?.freeCashFlowMargin.direction ??
  "Unavailable"
}

Return on Invested Capital:
${
  input.trends?.returnOnInvestedCapital.oldest != null &&
  input.trends?.returnOnInvestedCapital.latest != null
    ? `${input.trends.returnOnInvestedCapital.oldest.toFixed(
        2
      )}% → ${input.trends.returnOnInvestedCapital.latest.toFixed(
        2
      )}%`
    : "Unavailable"
}

ROIC Direction:
${
  input.trends?.returnOnInvestedCapital.direction ??
  "Unavailable"
}

Share Count:
${
  input.trends?.shareCount.oldest != null &&
  input.trends?.shareCount.latest != null
    ? `${input.trends.shareCount.oldest.toLocaleString(
        "en-US"
      )} → ${input.trends.shareCount.latest.toLocaleString(
        "en-US"
      )}`
    : "Unavailable"
}

Share Count Direction:
${
  input.trends?.shareCount.direction ??
  "Unavailable"
}

CapEx / Revenue:
${
  input.trends?.capexToRevenue.oldest != null &&
  input.trends?.capexToRevenue.latest != null
    ? `${input.trends.capexToRevenue.oldest.toFixed(
        2
      )}% → ${input.trends.capexToRevenue.latest.toFixed(
        2
      )}%`
    : "Unavailable"
}

CapEx / Revenue Direction:
${
  input.trends?.capexToRevenue.direction ??
  "Unavailable"
}

CURRENT EARNINGS CONTEXT

Latest Reported Quarter:
${
  input.earnings?.latestReported
    ? `
Report Date:
${input.earnings.latestReported.date}

EPS Actual:
${
  input.earnings.latestReported.epsActual != null
    ? input.earnings.latestReported.epsActual.toFixed(2)
    : "Unavailable"
}

EPS Estimate:
${
  input.earnings.latestReported.epsEstimated != null
    ? input.earnings.latestReported.epsEstimated.toFixed(2)
    : "Unavailable"
}

EPS Surprise:
${
  input.earnings.latestReported.epsSurprisePct != null
    ? `${input.earnings.latestReported.epsSurprisePct.toFixed(2)}%`
    : "Unavailable"
}

Revenue Actual:
${
  input.earnings.latestReported.revenueActual != null
    ? `$${input.earnings.latestReported.revenueActual.toLocaleString("en-US")}`
    : "Unavailable"
}

Revenue Estimate:
${
  input.earnings.latestReported.revenueEstimated != null
    ? `$${input.earnings.latestReported.revenueEstimated.toLocaleString("en-US")}`
    : "Unavailable"
}

Revenue Surprise:
${
  input.earnings.latestReported.revenueSurprisePct != null
    ? `${input.earnings.latestReported.revenueSurprisePct.toFixed(2)}%`
    : "Unavailable"
}
`
    : "Unavailable"
}

Previous Reported Quarter:
${
  input.earnings?.previousReported
    ? `
Report Date:
${input.earnings.previousReported.date}

EPS Surprise:
${
  input.earnings.previousReported.epsSurprisePct != null
    ? `${input.earnings.previousReported.epsSurprisePct.toFixed(2)}%`
    : "Unavailable"
}

Revenue Surprise:
${
  input.earnings.previousReported.revenueSurprisePct != null
    ? `${input.earnings.previousReported.revenueSurprisePct.toFixed(2)}%`
    : "Unavailable"
}
`
    : "Unavailable"
}

Next Expected Earnings:
${
  input.earnings?.nextExpected
    ? `
Expected Report Date:
${input.earnings.nextExpected.date}

EPS Estimate:
${
  input.earnings.nextExpected.epsEstimated != null
    ? input.earnings.nextExpected.epsEstimated.toFixed(2)
    : "Unavailable"
}

Revenue Estimate:
${
  input.earnings.nextExpected.revenueEstimated != null
    ? `$${input.earnings.nextExpected.revenueEstimated.toLocaleString("en-US")}`
    : "Unavailable"
}
`
    : "Unavailable"
}

EV / Sales:
${
  input.fundamentals?.evToSales != null
    ? `${input.fundamentals.evToSales.toFixed(2)}x`
    : "Unavailable"
}

EV / Operating Cash Flow:
${
  input.fundamentals?.evToOperatingCashFlow != null
    ? `${input.fundamentals.evToOperatingCashFlow.toFixed(2)}x`
    : "Unavailable"
}

EV / Free Cash Flow:
${
  input.fundamentals?.evToFreeCashFlow != null
    ? `${input.fundamentals.evToFreeCashFlow.toFixed(2)}x`
    : "Unavailable"
}

EV / EBITDA:
${
  input.fundamentals?.evToEbitda != null
    ? `${input.fundamentals.evToEbitda.toFixed(2)}x`
    : "Unavailable"
}

Net Debt / EBITDA:
${
  input.fundamentals?.netDebtToEbitda != null
    ? `${input.fundamentals.netDebtToEbitda.toFixed(2)}x`
    : "Unavailable"
}

Free Cash Flow Yield:
${
  input.fundamentals?.freeCashFlowYield != null
    ? `${input.fundamentals.freeCashFlowYield.toFixed(2)}%`
    : "Unavailable"
}

Revenue Growth:
${
  input.fundamentals?.revenueGrowth != null
    ? `${input.fundamentals.revenueGrowth.toFixed(2)}%`
    : "Unavailable"
}

Operating Income:
${
  input.fundamentals?.operatingIncome != null
    ? `$${input.fundamentals.operatingIncome.toLocaleString("en-US")}`
    : "Unavailable"
}

Operating Margin:
${
  input.fundamentals?.operatingMargin != null
    ? `${input.fundamentals.operatingMargin.toFixed(2)}%`
    : "Unavailable"
}

Net Income:
${
  input.fundamentals?.netIncome != null
    ? `$${input.fundamentals.netIncome.toLocaleString("en-US")}`
    : "Unavailable"
}

Operating Cash Flow:
${
  input.fundamentals?.operatingCashFlow != null
    ? `$${input.fundamentals.operatingCashFlow.toLocaleString("en-US")}`
    : "Unavailable"
}

Capital Expenditures:
${
  input.fundamentals?.capitalExpenditures != null
    ? `$${input.fundamentals.capitalExpenditures.toLocaleString("en-US")}`
    : "Unavailable"
}

Free Cash Flow:
${
  input.fundamentals?.freeCashFlow != null
    ? `$${input.fundamentals.freeCashFlow.toLocaleString("en-US")}`
    : "Unavailable"
}

Cash and Equivalents:
${
  input.fundamentals?.cashAndEquivalents != null
    ? `$${input.fundamentals.cashAndEquivalents.toLocaleString("en-US")}`
    : "Unavailable"
}

Total Debt:
${
  input.fundamentals?.totalDebt != null
    ? `$${input.fundamentals.totalDebt.toLocaleString("en-US")}`
    : "Unavailable"
}

Return on Equity:
${
  input.fundamentals?.returnOnEquity != null
    ? `${input.fundamentals.returnOnEquity.toFixed(2)}%`
    : "Unavailable"
}

Market Capitalization:
${
  input.fundamentals?.marketCap != null
    ? `$${input.fundamentals.marketCap.toLocaleString("en-US")}`
    : "Unavailable"
}

Enterprise Value:
${
  input.fundamentals?.enterpriseValue != null
    ? `$${input.fundamentals.enterpriseValue.toLocaleString("en-US")}`
    : "Unavailable"
}

EV / Sales:
${
  input.fundamentals?.evToSales != null
    ? `${input.fundamentals.evToSales.toFixed(2)}x`
    : "Unavailable"
}

EV / Operating Cash Flow:
${
  input.fundamentals?.evToOperatingCashFlow != null
    ? `${input.fundamentals.evToOperatingCashFlow.toFixed(2)}x`
    : "Unavailable"
}

EV / Free Cash Flow:
${
  input.fundamentals?.evToFreeCashFlow != null
    ? `${input.fundamentals.evToFreeCashFlow.toFixed(2)}x`
    : "Unavailable"
}

EV / EBITDA:
${
  input.fundamentals?.evToEbitda != null
    ? `${input.fundamentals.evToEbitda.toFixed(2)}x`
    : "Unavailable"
}

Net Debt / EBITDA:
${
  input.fundamentals?.netDebtToEbitda != null
    ? `${input.fundamentals.netDebtToEbitda.toFixed(2)}x`
    : "Unavailable"
}

Free Cash Flow Yield:
${
  input.fundamentals?.freeCashFlowYield != null
    ? `${input.fundamentals.freeCashFlowYield.toFixed(2)}%`
    : "Unavailable"
}

P/E Ratio:
${
  input.fundamentals?.peRatio != null
    ? input.fundamentals.peRatio.toFixed(2)
    : "Unavailable"
}

Price to Sales:
${
  input.fundamentals?.priceToSalesRatio != null
    ? input.fundamentals.priceToSalesRatio.toFixed(2)
    : "Unavailable"
}

Price to Book:
${
  input.fundamentals?.priceToBookRatio != null
    ? input.fundamentals.priceToBookRatio.toFixed(2)
    : "Unavailable"
}

Price / Earnings:
${
  input.fundamentals?.peRatio != null
    ? `${input.fundamentals.peRatio.toFixed(2)}x`
    : "Unavailable"
}

Price / Sales:
${
  input.fundamentals?.priceToSalesRatio != null
    ? `${input.fundamentals.priceToSalesRatio.toFixed(2)}x`
    : "Unavailable"
}

Price / Book:
${
  input.fundamentals?.priceToBookRatio != null
    ? `${input.fundamentals.priceToBookRatio.toFixed(2)}x`
    : "Unavailable"
}

Price / Free Cash Flow:
${
  input.fundamentals?.priceToFreeCashFlowRatio != null
    ? `${input.fundamentals.priceToFreeCashFlowRatio.toFixed(2)}x`
    : "Unavailable"
}

Earnings Yield:
${
  input.fundamentals?.earningsYield != null
    ? `${input.fundamentals.earningsYield.toFixed(2)}%`
    : "Unavailable"
}

Return on Equity:
${
  input.fundamentals?.returnOnEquity != null
    ? `${input.fundamentals.returnOnEquity.toFixed(2)}%`
    : "Unavailable"
}

Return on Assets:
${
  input.fundamentals?.returnOnAssets != null
    ? `${input.fundamentals.returnOnAssets.toFixed(2)}%`
    : "Unavailable"
}

Return on Invested Capital:
${
  input.fundamentals?.returnOnInvestedCapital != null
    ? `${input.fundamentals.returnOnInvestedCapital.toFixed(2)}%`
    : "Unavailable"
}

Return on Capital Employed:
${
  input.fundamentals?.returnOnCapitalEmployed != null
    ? `${input.fundamentals.returnOnCapitalEmployed.toFixed(2)}%`
    : "Unavailable"
}

Debt / Equity:
${
  input.fundamentals?.debtToEquity != null
    ? `${input.fundamentals.debtToEquity.toFixed(2)}x`
    : "Unavailable"
}

Interest Coverage:
${
  input.fundamentals?.interestCoverage != null
    ? `${input.fundamentals.interestCoverage.toFixed(2)}x`
    : "Unavailable"
}

Current Ratio:
${
  input.fundamentals?.currentRatio != null
    ? input.fundamentals.currentRatio.toFixed(2)
    : "Unavailable"
}

Free Cash Flow / Operating Cash Flow:
${
  input.fundamentals?.freeCashFlowToOperatingCashFlow != null
    ? `${input.fundamentals.freeCashFlowToOperatingCashFlow.toFixed(2)}%`
    : "Unavailable"
}

CapEx / Operating Cash Flow:
${
  input.fundamentals?.capexToOperatingCashFlow != null
    ? `${input.fundamentals.capexToOperatingCashFlow.toFixed(2)}%`
    : "Unavailable"
}

CapEx / Revenue:
${
  input.fundamentals?.capexToRevenue != null
    ? `${input.fundamentals.capexToRevenue.toFixed(2)}%`
    : "Unavailable"
}

R&D / Revenue:
${
  input.fundamentals?.researchAndDevelopmentToRevenue != null
    ? `${input.fundamentals.researchAndDevelopmentToRevenue.toFixed(2)}%`
    : "Unavailable"
}

Stock-Based Compensation / Revenue:
${
  input.fundamentals?.stockBasedCompensationToRevenue != null
    ? `${input.fundamentals.stockBasedCompensationToRevenue.toFixed(2)}%`
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
Evaluate whether the security fits this specific portfolio mandate, whether an existing position should be increased/reduced/held, and what allocation range would be reasonable.

Important rules:
- Clearly distinguish facts from inference.
- Do not fabricate financial metrics, news, earnings results, analyst estimates, or company events.
- If relevant information is unavailable, explicitly say so.
- Treat the market price supplied above as the reference price.
- Be skeptical of weak evidence.
- Avoid false precision.
- When evaluating historical trends, distinguish the long-term endpoint change from the recent trajectory.
- Do not describe a metric simply as "declining" or "improving" when the most recent direction materially differs from the full-period comparison.
- For volatile metrics such as margins, ROIC, revenue growth, free cash flow, leverage, and share count, explicitly identify whether the recent trend is improving, deteriorating, stable, or mixed.
- Give greater analytical weight to sustained multi-period trends than to a single unusually strong or weak historical endpoint, while still identifying meaningful long-term deterioration.
- Do not issue the final committee recommendation. The Committee Chair will do that separately.
- Use the supplied valuation metrics explicitly and comparatively. A low P/E or EV/FCF is not automatically attractive if growth, returns on capital, or cash conversion are weak; a high multiple is not automatically unattractive if durable growth and returns on capital justify it.
- Do not describe valuation as unknown when EV-based valuation metrics are available.
- If P/E, P/S, or P/B are unavailable, do not invent them; use the available EV and cash-flow metrics instead.
- Treat capital expenditures as a cash outflow and evaluate their effect on free-cash-flow conversion and return on invested capital.
- Use return-on-capital metrics such as ROIC and ROCE to evaluate business quality, not just revenue growth and margins.
- Evaluate valuation using the full set of available measures, including P/E, P/FCF, EV/FCF, EV/EBITDA, earnings yield, and free-cash-flow yield.
- Evaluate free-cash-flow conversion explicitly when FCF/OCF is available.
- Treat CapEx/OCF and CapEx/Revenue as evidence of capital intensity; distinguish productive reinvestment from structurally weak cash conversion.
- Consider stock-based compensation as an economic cost and dilution risk when SBC/Revenue is material.
- Use R&D/Revenue as context for innovation intensity, but do not assume higher R&D automatically means better returns.
- Use leverage and interest coverage together when assessing financial risk.
- Distinguish current absolute quality from historical direction. A company can still have excellent current margins or ROIC while those metrics are deteriorating.
- Treat improving operating margins alongside deteriorating free-cash-flow margins as a potential warning that capital intensity or cash conversion is worsening.
- Use ROIC trend to judge whether incremental capital is becoming more or less productive.
- Treat rising CapEx/Revenue as evidence of increasing capital intensity; determine whether current growth and returns justify that investment.
- Use share-count trend to identify meaningful dilution or shareholder-friendly buybacks.
- Do not treat one favorable current metric as sufficient if the multi-year trend is materially deteriorating.
- When adjudicating historical trends, distinguish long-term endpoint changes from the recent trajectory.
- Do not characterize a metric as simply declining or improving when recent periods show a materially different direction.
- If long-term and recent trends conflict, state both and explain which is more relevant to the final decision.
`;
}

export function buildChairPrompt(input: {
  ticker: string;
  marketPrice: number | null;
  portfolioMode: CommitteePortfolioMode;
  portfolioName: string;
  availableCash: number;
  specialistAnalysis: SpecialistAnalysis;

  discoveryEvidence:
    DiscoveryEvidence | null;
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

Portfolio:
${input.portfolioName}

Ticker:
${input.ticker}

Reference market price:
${
  input.marketPrice != null
    ? `$${input.marketPrice.toFixed(2)}`
    : "Unavailable"
}

Available cash:
$${input.availableCash.toFixed(2)}

DISCOVERY V2 SCREENING CONTEXT

This is prior quantitative screening evidence, not a recommendation.

Use it to understand why the security reached committee review, but do not allow a high Discovery score to substitute for independent judgment.

If the specialist evidence conflicts with Discovery V2, identify the conflict and resolve it based on the stronger underlying evidence.

${
  input.discoveryEvidence
    ? `
Discovery date:
${input.discoveryEvidence.discoveryDate}

Market-cap bucket:
${input.discoveryEvidence.marketCapBucket ?? "Unavailable"}

Sector:
${input.discoveryEvidence.sector ?? "Unavailable"}

Industry:
${input.discoveryEvidence.industry ?? "Unavailable"}

Quality score:
${input.discoveryEvidence.qualityScore.toFixed(2)}/100

Growth score:
${input.discoveryEvidence.growthScore.toFixed(2)}/100

Valuation score:
${input.discoveryEvidence.valuationScore.toFixed(2)}/100

Trend quality score:
${input.discoveryEvidence.trendQualityScore.toFixed(2)}/100

Capital discipline score:
${input.discoveryEvidence.capitalDisciplineScore.toFixed(2)}/100

Deep score:
${input.discoveryEvidence.deepScore.toFixed(2)}/100

Portfolio fit score:
${input.discoveryEvidence.portfolioFitScore.toFixed(2)}/100

Final Discovery score:
${input.discoveryEvidence.totalScore.toFixed(2)}/100

Discovery summary:
${input.discoveryEvidence.reasonSummary ?? "Unavailable"}
`
    : `
No Discovery V2 screening record is available for this security.
`
}

SPECIALIST ANALYSIS

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

You must select exactly one final recommendation:

buy
sell
hold
watch
avoid
rebalance

Definitions:

BUY:
Initiate or materially increase a position.

SELL:
Exit a position.

HOLD:
Maintain an existing position without meaningful change.

WATCH:
Potentially attractive, but evidence, valuation, timing, or risk does not justify action yet.

AVOID:
The security does not currently meet the portfolio mandate.

REBALANCE:
Adjust an existing position without fully exiting it.

Confidence:
Return a score from 0 to 100. High confidence should require strong evidence and limited unresolved uncertainty.

Risk:
Classify as low, medium, or high relative to this portfolio mandate.

Recommended allocation:
Return the recommended dollar allocation for the portfolio after this decision, not merely the size of the next trade.
Use null when an allocation is not meaningful, such as an AVOID decision.

Final thesis:
Explain concisely why the committee reached its conclusion.

Reassessment conditions:
State observable developments that should trigger a fresh committee review.

Exit conditions:
For a BUY/HOLD/REBALANCE decision, state the conditions that would invalidate the thesis or justify exiting.
For WATCH/AVOID/SELL, state what would need to change before reconsideration where appropriate.

Important rules:
- Do not simply average the specialists.
- Resolve disagreements explicitly.
- The bear and risk cases must materially influence the final decision.
- Do not fabricate information.
- Do not recommend an allocation greater than the portfolio could reasonably support.
- Preserve uncertainty where evidence is incomplete.
- Treat earnings surprises as current evidence, not as proof of future performance.
- Distinguish reported results from future estimates.
- Use the next expected earnings date as a potential reassessment catalyst.
- Do not invent management guidance that is not explicitly supplied.
`;
}