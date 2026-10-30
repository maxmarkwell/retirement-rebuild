import "server-only";
import { getDynamicDiscoveryUniverse } from "../dynamic-universe";
import { passesAgTradabilityGate } from "./discovery";
import { researchAgOpportunityEvidence, AG_OPPORTUNITY_RESEARCH_VERSION } from "./opportunity-research";

/**
 * One bounded, read-only Discovery v2 research step.
 *
 * The coordinator supplies one predetermined ticker per invocation and is
 * responsible for saving its output before advancing. This function does not
 * select from the universe based on liquidity, does not retry an uncertain
 * provider result, and cannot create decisions or trades.
 */
export async function researchAgOpportunityDiscoveryStep(input: {
  symbol: string;
}) {
  const symbol = input.symbol.trim().toUpperCase();
  if (!/^[A-Z][A-Z0-9.-]{0,14}$/.test(symbol)) throw new Error("AG_OPPORTUNITY_STEP_INVALID_SYMBOL");
  const universe = await getDynamicDiscoveryUniverse();
  const matches = universe.filter(stock => stock.ticker.toUpperCase() === symbol);
  if (matches.length !== 1) throw new Error("AG_OPPORTUNITY_STEP_UNIVERSE_MISMATCH");
  const stock = matches[0];
  if (!passesAgTradabilityGate(stock)) throw new Error("AG_OPPORTUNITY_STEP_NOT_TRADABLE");

  const result = await researchAgOpportunityEvidence({
    symbol,
    companyName: null,
    quantitativeContext: {
      sector: stock.sector,
      industry: stock.industry,
      marketCap: stock.marketCap,
      marketCapBucket: stock.marketCapBucket,
      price: stock.price,
      dollarVolume: stock.dollarVolume,
    },
  });

  if (result.qualification.symbol !== symbol ||
      result.researchVersion !== AG_OPPORTUNITY_RESEARCH_VERSION) {
    throw new Error("AG_OPPORTUNITY_STEP_RESULT_MISMATCH");
  }
  return {
    symbol,
    version: AG_OPPORTUNITY_RESEARCH_VERSION,
    universeEligible: true as const,
    qualification: result.qualification,
    model: result.model,
  };
}
