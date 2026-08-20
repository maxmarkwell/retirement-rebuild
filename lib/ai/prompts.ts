import type {
  CommitteePortfolioMode,
  SpecialistAnalysis,
} from "./committee-types";
import type { CompanyFundamentals } from "@/lib/company-data/types";
import type { CompanyEarningsContext } from "@/lib/company-data/earnings";

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
- Do not issue the final committee recommendation. The Committee Chair will do that separately.
- Use the supplied valuation metrics explicitly when assessing whether the current price is attractive.
- Do not describe valuation as unknown when EV-based valuation metrics are available.
- If P/E, P/S, or P/B are unavailable, do not invent them; use the available EV and cash-flow metrics instead.
- Treat capital expenditures as a cash outflow and evaluate their effect on free-cash-flow conversion and return on invested capital.
`;
}

export function buildChairPrompt(input: {
  ticker: string;
  marketPrice: number | null;
  portfolioMode: CommitteePortfolioMode;
  portfolioName: string;
  availableCash: number;
  specialistAnalysis: SpecialistAnalysis;
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