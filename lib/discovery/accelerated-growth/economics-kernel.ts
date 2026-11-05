/**
 * AG charter-aligned, pure research-only valuation kernel.
 *
 * This is a mechanism for testing explicitly supplied thesis economics, NOT
 * an assumption generator, automated stock screener, Committee, recommendation,
 * risk budget, position-sizing tool, or order-entry path.
 *
 * Model: terminal annual normalized unlevered FCF × terminal EV/FCF multiple,
 * less terminal net debt, divided by terminal diluted shares. No interim
 * distributions are modeled. Results are conditional on supplied assumptions.
 */
export const AG_ECONOMICS_KERNEL_VERSION = "ag-economics-kernel-v1";
export type OpportunityPath =
  | "accelerating_fundamentals"
  | "emerging_opportunity"
  | "turnaround"
  | "catalyst_driven"
  | "valuation_dislocation";
export type ScenarioName = "adverse" | "base" | "favorable";
export type ScenarioAssumptions = {
  annualUnleveredFcfUsd: number;
  terminalEvToFcf: number;
  terminalNetDebtUsd: number;
  terminalDilutedShares: number;
  economicMechanism: string;
  evidenceOrAssumption: string;
  invalidationCondition: string;
};
export type AgEconomicsInput = {
  symbol: string;
  asOf: string;
  priceUsd: number;
  quoteCapturedAt: string;
  quoteEvidenceRef: string;
  reconciledFactsRef: string;
  factReconciliation: "MATCH";
  thesisPath: OpportunityPath;
  thesis: string;
  thesisCounterEvidence: string;
  valueRealizationMechanism: string;
  horizonYears: number;
  scenarios: Record<ScenarioName, ScenarioAssumptions>;
};
export type ScenarioOutcome = {
  scenario: ScenarioName;
  terminalEnterpriseValueUsd: number;
  terminalEquityValueUsd: number;
  impliedPriceUsd: number;
  simpleReturn: number;
  annualizedReturn: number;
  assumesCapitalLoss: boolean;
};
export type AgEconomicsResult = {
  version: typeof AG_ECONOMICS_KERNEL_VERSION;
  symbol: string;
  asOf: string;
  priceUsd: number;
  horizonYears: number;
  thesisPath: OpportunityPath;
  evidence: { quoteEvidenceRef: string; reconciledFactsRef: string; quoteCapturedAt: string };
  outcomes: Record<ScenarioName, ScenarioOutcome>;
  upsideVsDownside: number | null;
  upsidePotentialPct: number;
  adverseLossPct: number;
  resultType: "SCENARIO_ECONOMICS_ONLY";
  recommendation: null;
  executionEnabled: false;
  positionSizingEnabled: false;
  limitations: string[];
};

const paths: OpportunityPath[] = [
  "accelerating_fundamentals", "emerging_opportunity", "turnaround",
  "catalyst_driven", "valuation_dislocation",
];
const finite = (n: unknown): n is number =>
  typeof n === "number" && Number.isFinite(n);
const meaningful = (s: unknown): s is string =>
  typeof s === "string" && s.trim().length >= 12 && s.trim().length <= 1000;
function failure(reason: string): never { throw new Error("AG_ECONOMICS_" + reason); }
const names: ScenarioName[] = ["adverse", "base", "favorable"];

function scenarioOutcome(
  scenario: ScenarioName,
  a: ScenarioAssumptions,
  priceUsd: number,
  horizonYears: number,
): ScenarioOutcome {
  if (!a || !finite(a.annualUnleveredFcfUsd) || a.annualUnleveredFcfUsd <= 0 ||
      !finite(a.terminalEvToFcf) || a.terminalEvToFcf <= 0 || a.terminalEvToFcf > 100 ||
      !finite(a.terminalNetDebtUsd) || !finite(a.terminalDilutedShares) ||
      a.terminalDilutedShares <= 0 || !meaningful(a.economicMechanism) ||
      !meaningful(a.evidenceOrAssumption) || !meaningful(a.invalidationCondition))
    failure("INVALID_SCENARIO_" + scenario.toUpperCase());

  const terminalEnterpriseValueUsd = a.annualUnleveredFcfUsd * a.terminalEvToFcf;
  const terminalEquityValueUsd = terminalEnterpriseValueUsd - a.terminalNetDebtUsd;
  if (!finite(terminalEnterpriseValueUsd) || terminalEquityValueUsd <= 0 ||
      !finite(terminalEquityValueUsd))
    failure("UNSUPPORTED_TERMINAL_EQUITY_" + scenario.toUpperCase());
  const impliedPriceUsd = terminalEquityValueUsd / a.terminalDilutedShares;
  if (!finite(impliedPriceUsd) || impliedPriceUsd <= 0)
    failure("INVALID_TERMINAL_PRICE_" + scenario.toUpperCase());
  const simpleReturn = impliedPriceUsd / priceUsd - 1;
  const annualizedReturn = Math.pow(impliedPriceUsd / priceUsd, 1 / horizonYears) - 1;
  if (!finite(simpleReturn) || !finite(annualizedReturn))
    failure("INVALID_RETURN_" + scenario.toUpperCase());
  return {
    scenario, terminalEnterpriseValueUsd, terminalEquityValueUsd,
    impliedPriceUsd, simpleReturn, annualizedReturn,
    assumesCapitalLoss: simpleReturn < 0,
  };
}

/**
 * Price sensitivity is intentional: keep the business scenarios fixed when
 * comparing available prices. Never alter the economic model to force a BUY.
 */
export function assessAgScenarioEconomics(input: AgEconomicsInput): AgEconomicsResult {
  if (!input || !/^[A-Z][A-Z0-9.-]{0,14}$/.test(input.symbol) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(input.asOf) ||
      Number.isNaN(Date.parse(input.asOf + "T00:00:00Z")) ||
      !finite(input.priceUsd) || input.priceUsd <= 0 ||
      typeof input.quoteCapturedAt !== "string" ||
      !Number.isFinite(Date.parse(input.quoteCapturedAt)) ||
      Date.parse(input.quoteCapturedAt) > Date.parse(input.asOf + "T23:59:59.999Z") ||
      !meaningful(input.quoteEvidenceRef) || !meaningful(input.reconciledFactsRef) ||
      input.factReconciliation !== "MATCH" ||
      !paths.includes(input.thesisPath) ||
      !meaningful(input.thesis) || !meaningful(input.thesisCounterEvidence) ||
      !meaningful(input.valueRealizationMechanism) ||
      !Number.isInteger(input.horizonYears) || input.horizonYears < 1 ||
      input.horizonYears > 10 || !input.scenarios)
    failure("INVALID_INPUT_OR_POINT_IN_TIME");
  const outcomes = {} as Record<ScenarioName, ScenarioOutcome>;
  for (const name of names) outcomes[name] = scenarioOutcome(
    name, input.scenarios[name], input.priceUsd, input.horizonYears,
  );
  if (!(outcomes.adverse.impliedPriceUsd < outcomes.base.impliedPriceUsd &&
        outcomes.base.impliedPriceUsd < outcomes.favorable.impliedPriceUsd))
    failure("UNORDERED_SCENARIO_ECONOMICS");

  const upside = Math.max(0, outcomes.favorable.impliedPriceUsd / input.priceUsd - 1);
  const loss = Math.max(0, 1 - outcomes.adverse.impliedPriceUsd / input.priceUsd);
  const upsideVsDownside = loss > 0 ? upside / loss : null;
  return {
    version: AG_ECONOMICS_KERNEL_VERSION, symbol: input.symbol,
    asOf: input.asOf, priceUsd: input.priceUsd, horizonYears: input.horizonYears,
    thesisPath: input.thesisPath,
    evidence: {
      quoteEvidenceRef: input.quoteEvidenceRef,
      reconciledFactsRef: input.reconciledFactsRef,
      quoteCapturedAt: input.quoteCapturedAt,
    },
    outcomes,
    upsideVsDownside,
    upsidePotentialPct: upside * 100,
    adverseLossPct: loss * 100,
    resultType: "SCENARIO_ECONOMICS_ONLY",
    recommendation: null,
    executionEnabled: false,
    positionSizingEnabled: false,
    limitations: [
      "Scenarios are analyst-supplied assumptions, not inferred facts or independent forecasts.",
      "This is a terminal EV/unlevered-FCF multiple sensitivity; it omits interim distributions, tax, transaction costs, and timing variation.",
      "Terminal net debt and diluted shares must be independently supported and may differ in each scenario.",
      "Missing or negative sustainable FCF requires a separately validated method; this method must not invent positive cash generation.",
      "Results are for paper research only and cannot authorize BUY, options, sizing, orders, funding, or real portfolio changes.",
    ],
  };
}
