import type { DynamicUniverseStock } from "../dynamic-universe";
import { AG_LIQUIDITY_VERSION } from "./liquidity";
import { deriveAgThemeKey } from "./theme";

export type AgExecutionEvidence = {
  liquidityEligible: boolean;
  shareVolume: number | null;
  dollarVolume: number | null;
  themeKey: string | null;
  evidenceVersion: string;
};

export function deriveAgExecutionEvidence(stock: DynamicUniverseStock | undefined): AgExecutionEvidence {
  const shareVolume = stock?.volume ?? null;
  const dollarVolume = stock?.dollarVolume ?? null;
  const liquidityEligible =
    shareVolume != null &&
    Number.isFinite(shareVolume) &&
    shareVolume >= 50_000 &&
    dollarVolume != null &&
    Number.isFinite(dollarVolume) &&
    dollarVolume >= 1_000_000;

  return {
    liquidityEligible,
    shareVolume,
    dollarVolume,
    themeKey: deriveAgThemeKey({ sector: stock?.sector }),
    evidenceVersion: `ag-execution-evidence-v1+${AG_LIQUIDITY_VERSION}`,
  };
}
