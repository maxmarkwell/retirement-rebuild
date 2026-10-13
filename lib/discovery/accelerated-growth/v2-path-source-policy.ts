import type { V2Path } from "./v2-path-evaluators";
import type { AgV2Source } from "./v2-source-contract";

/**
 * Required evidence names and permitted provenance by opportunity path.
 * Boolean assertions (e.g. verified catalysts) are encoded as 1/0 for the
 * numeric evidence contract, but must be independently corroborated upstream.
 */
export const V2_PATH_SOURCE_POLICY: Record<V2Path, Readonly<Record<string, readonly AgV2Source["kind"][]>>> = {
  TURNAROUND: {
    operatingMargin: ["FILING"], freeCashFlow: ["FILING"],
    cash: ["FILING"], debt: ["FILING"], debtMaturities: ["FILING"],
    creditAvailability: ["FILING"],
  },
  VALUATION_DISLOCATION: {
    marketCap: ["MARKET_DATA"], independentEquityValue: ["INDEPENDENT_ANALYSIS"],
    normalizedFreeCashFlow: ["FILING", "INDEPENDENT_ANALYSIS"],
    cash: ["FILING"], debt: ["FILING"], debtMaturities: ["FILING"],
    realizationMechanism: ["FILING", "INDEPENDENT_ANALYSIS"],
  },
  ACCELERATING_FUNDAMENTALS: {
    latestRevenueGrowth: ["FILING"], priorRevenueGrowth: ["FILING"],
    latestOperatingMargin: ["FILING"], priorOperatingMargin: ["FILING"],
    latestFreeCashFlow: ["FILING"], periodContinuity: ["FILING"],
    cash: ["FILING"], debt: ["FILING"], debtMaturities: ["FILING"],
    creditAvailability: ["FILING"],
  },
  EMERGING_OPPORTUNITY: {
    commercialRevenue: ["FILING"], priorCommercialRevenue: ["FILING"],
    customerCount: ["FILING", "INDEPENDENT_ANALYSIS"],
    priorCustomerCount: ["FILING", "INDEPENDENT_ANALYSIS"],
    productInMarket: ["FILING", "INDEPENDENT_ANALYSIS"],
    repeatableUnitEconomics: ["FILING", "INDEPENDENT_ANALYSIS"],
    periodContinuity: ["FILING"],
    cash: ["FILING"], debt: ["FILING"], debtMaturities: ["FILING"],
    creditAvailability: ["FILING"],
  },
  CATALYST: {
    eventDate: ["FILING", "INDEPENDENT_ANALYSIS"],
    verifiedEvent: ["FILING", "INDEPENDENT_ANALYSIS"],
    economicImpact: ["FILING", "INDEPENDENT_ANALYSIS"],
    independentCorroboration: ["INDEPENDENT_ANALYSIS"],
    executionFunding: ["FILING"],
    invalidationTrigger: ["FILING", "INDEPENDENT_ANALYSIS"],
    cash: ["FILING"], debt: ["FILING"], debtMaturities: ["FILING"],
    creditAvailability: ["FILING"],
  },
};
