export type InvestmentSummaryInput = { realGrowth: number; agPaperGrowth: number; realCash: number; realEquity: number; contributedCapital: number; realQuotesComplete: boolean; agQuotesComplete: boolean };
export function calculateInvestmentOverview(input: InvestmentSummaryInput) {
  const values = [input.realGrowth, input.agPaperGrowth, input.realCash, input.realEquity, input.contributedCapital];
  if (values.some(v => !Number.isFinite(v))) throw new Error("Non-finite investment overview value.");
  const realGain = input.realQuotesComplete ? input.realGrowth : null;
  const paperGain = input.agQuotesComplete ? input.agPaperGrowth : null;
  const combinedStrategyGain = realGain == null || paperGain == null ? null : Math.round((realGain + paperGain) * 100) / 100;
  return {
    realGain, paperGain, combinedStrategyGain,
    realCash: input.realCash, realEquity: input.realEquity,
    contributedCapital: input.contributedCapital,
    // Never add virtual paper capital or cash to real account totals.
    realReturnPct: realGain == null || input.contributedCapital <= 0 ? null : 100 * realGain / input.contributedCapital,
  };
}
