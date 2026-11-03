/**
 * Deterministic AG persistence probe only. No market research or investment recommendation.
 * Kept pure so malformed saved JSON fails closed before any write.
 */
export const AG_PERSISTENCE_PROBE_VERSION = "ag-persistence-probe-v1";
export const AG_PERSISTENCE_PROBE_STAGE = "ag_probe_ready";

export type ProbeCheckpoint = {
  symbol: string;
  ordinal: number;
  result: "MANIFEST_VERIFIED";
};
export type ProbeState = {
  version: typeof AG_PERSISTENCE_PROBE_VERSION;
  symbols: string[];
  cursor: number;
  results: ProbeCheckpoint[];
};

const symbolPattern = /^[A-Z][A-Z0-9.-]{0,14}$/;
export function normalizeProbeSymbols(input: unknown): string[] {
  if (!Array.isArray(input) || input.length < 1 || input.length > 3 ||
      input.some(value => typeof value !== "string")) {
    throw new Error("AG_PROBE_INVALID_SYMBOLS");
  }
  const symbols = input.map((value: string) => value.trim().toUpperCase());
  if (symbols.some((symbol: string) => !symbolPattern.test(symbol)) ||
      new Set(symbols).size !== symbols.length) {
    throw new Error("AG_PROBE_INVALID_SYMBOLS");
  }
  return symbols;
}

export function readProbeState(value: unknown): ProbeState {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("AG_PROBE_INVALID_STATE");
  }
  const raw = value as Record<string, unknown>;
  if (raw.version !== AG_PERSISTENCE_PROBE_VERSION ||
      !Array.isArray(raw.symbols) || !Array.isArray(raw.results) ||
      !Number.isInteger(raw.cursor)) {
    throw new Error("AG_PROBE_INVALID_STATE");
  }
  let symbols: string[];
  try { symbols = normalizeProbeSymbols(raw.symbols); }
  catch { throw new Error("AG_PROBE_INVALID_STATE"); }
  const cursor = raw.cursor as number;
  if (cursor < 0 || cursor > symbols.length || raw.results.length !== cursor ||
      raw.results.some((item, i) => {
        if (!item || typeof item !== "object") return true;
        const result = item as Record<string, unknown>;
        return result.symbol !== symbols[i] || result.ordinal !== i ||
          result.result !== "MANIFEST_VERIFIED";
      })) {
    throw new Error("AG_PROBE_INVALID_STATE");
  }
  return { version: AG_PERSISTENCE_PROBE_VERSION, symbols, cursor,
    results: raw.results as ProbeCheckpoint[] };
}

export function nextProbeState(state: ProbeState): ProbeState {
  if (state.cursor >= state.symbols.length) throw new Error("AG_PROBE_ALREADY_FINISHED");
  return {
    ...state,
    cursor: state.cursor + 1,
    results: [...state.results, {
      symbol: state.symbols[state.cursor],
      ordinal: state.cursor,
      result: "MANIFEST_VERIFIED",
    }],
  };
}
