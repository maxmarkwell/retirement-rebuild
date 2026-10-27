export type InvestmentSummaryInput = {
  realGrowth: number;
  agPaperGrowth: number;
  realCash: number;
  realEquity: number;
  contributedCapital: number;
  agReferenceCapital: number;
  realQuotesComplete: boolean;
  agQuotesComplete: boolean;
};

const pct = (gain: number | null, base: number) =>
  gain == null || !Number.isFinite(base) || base <= 0 ? null : 100 * gain / base;

export function calculateInvestmentOverview(input: InvestmentSummaryInput) {
  const values = [input.realGrowth, input.agPaperGrowth, input.realCash, input.realEquity, input.contributedCapital, input.agReferenceCapital];
  if (values.some(v => !Number.isFinite(v))) throw new Error("Non-finite investment overview value.");
  const realGain = input.realQuotesComplete ? input.realGrowth : null;
  const paperGain = input.agQuotesComplete ? input.agPaperGrowth : null;
  const combinedStrategyGain = realGain == null || paperGain == null ? null : Math.round((realGain + paperGain) * 100) / 100;
  return {
    realGain, paperGain, combinedStrategyGain,
    realCash: input.realCash, realEquity: input.realEquity,
    contributedCapital: input.contributedCapital,
    realReturnPct: pct(realGain, input.contributedCapital),
    agReturnPct: pct(paperGain, input.agReferenceCapital),
    // A descriptive change relative to the shared capital base, not an
    // actual consolidated investment return while AG is independently tracked.
    combinedChangePct: pct(combinedStrategyGain, input.contributedCapital),
  };
}
