import "server-only";
import { getDynamicDiscoveryUniverse } from "../dynamic-universe";
import { passesAgTradabilityGate } from "./discovery";

/**
 * Cheap, exploratory five-company shortlist for validating the research pipeline.
 * No price/liquidity scoring, acceleration gates, assumed catalysts, or path quotas.
 * The independent five-path Discovery step alone decides whether each is qualified.
 * Market capitalization is used strictly for coarse coverage, NOT merit ranking.
 */
export async function getAgExploratoryShortlist(exclude: readonly string[] = []) {
  const stocks = (await getDynamicDiscoveryUniverse()).filter(passesAgTradabilityGate)
    .filter(s => !exclude.includes(s.ticker.toUpperCase()));
  const seen = new Set<string>();
  const eligible = stocks.filter(s => {
    const symbol = s.ticker.toUpperCase();
    if (seen.has(symbol)) return false;
    seen.add(symbol);
    return true;
  });
  // Deterministic, reproducible coverage across a broad universe, avoiding
  // the legacy selector's 80% liquidity / 20% share-price ranking.
  const ranked = [...eligible].sort((a,b) => a.ticker.localeCompare(b.ticker));
  const positions = [0.1,0.3,0.5,0.7,0.9].map(f => Math.floor((ranked.length - 1) * f));
  const chosen = positions.map(i => ranked[i]).filter(Boolean);
  if (chosen.length !== 5 || new Set(chosen.map(s => s.ticker)).size !== 5)
    throw new Error("AG_V2_SHORTLIST_INSUFFICIENT_UNIVERSE");
  return {
    symbols: chosen.map(s => s.ticker),
    universeEligibleCount: eligible.length,
    method: "deterministic_exploratory_coverage_v1" as const,
    warning: "Broad-universe coverage only. These stocks are NOT ranked by investment opportunity; five-path Discovery will independently assess merit.",
  };
}
