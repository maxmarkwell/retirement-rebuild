export const AG_CONFIDENCE_SCALE_VERSION = "ag-confidence-v1";

export function normalizeAgConfidence(value: number): number {
  if (!Number.isFinite(value)) throw new Error("AG confidence must be a finite number.");
  if (value < 0 || value > 100) throw new Error("AG confidence must be between 0 and 100.");
  // Legacy/model outputs sometimes used a 0-1 fraction despite the 0-100 schema.
  // Normalize those values at the research boundary; persisted confidence remains 0-1.
  const normalized = value <= 1 ? value : value / 100;
  return Math.round(normalized * 10_000) / 10_000;
}
