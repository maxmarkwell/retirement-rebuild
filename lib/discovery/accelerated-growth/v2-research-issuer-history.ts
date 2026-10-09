import { compareV2ResearchHistory, type V2ResearchHistoryRequest,
  type V2ResearchHistoryResult } from "./v2-research-history-shadow";

/**
 * Offline issuer-identity preflight for historical research selection.
 * Symbols can change or be reused. This checks supplied mappings, not their
 * authenticity, and never queries a database or changes a portfolio.
 */
export type V2IssuerIdentity = {
  symbol: string;
  issuerId: string;
  effectiveAt: string;
};
export type V2IdentityHistoryRequest = V2ResearchHistoryRequest & {
  issuerIdentitiesByCycle: readonly (readonly V2IssuerIdentity[])[];
};
export type V2IdentityHistoryResult =
  | { accepted: false; issues: string[] }
  | { accepted: true; comparison: Extract<V2ResearchHistoryResult, { accepted: true }>;
      uniqueV1Issuers: number; uniqueV2Issuers: number;
      v1IssuerRepeatSlots: number; v2IssuerRepeatSlots: number };

const CIK = /^CIK-\d{1,10}$/;
const UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/;
function validUtc(value: string): boolean {
  if (!UTC.test(value)) return false;
  const date = Date.parse(value);
  const canonical = value.replace(/\.(\d{1,3})Z$/, (_, ms: string) =>
    "." + ms.padEnd(3, "0") + "Z").replace(/\.000Z$/, "Z");
  return Number.isFinite(date) &&
    new Date(date).toISOString().replace(/\.000Z$/, "Z") === canonical;
}
export function compareV2ResearchHistoryWithIssuers(
  request: V2IdentityHistoryRequest,
): V2IdentityHistoryResult {
  const comparison = compareV2ResearchHistory(request);
  const issues: string[] = [];
  if (!comparison.accepted) issues.push(...comparison.issues);
  if (request.issuerIdentitiesByCycle.length !== request.cycles.length)
    issues.push("IDENTITY_CYCLE_COUNT_MISMATCH");
  const v1Seen = new Set<string>();
  const v2Seen = new Set<string>();
  let v1IssuerRepeatSlots = 0;
  let v2IssuerRepeatSlots = 0;
  const symbolIssuer = new Map<string, string>();
  const issuerSymbols = new Map<string, string>();
  for (const [index, cycle] of request.cycles.entries()) {
    const rows = request.issuerIdentitiesByCycle[index];
    if (!rows) continue;
    const prefix = "IDENTITY_CYCLE_" + index + ":";
    const bySymbol = new Map<string, string>();
    const byIssuer = new Map<string, string>();
    const expected = new Set(cycle.candidates.map(c => c.symbol.trim().toUpperCase()));
    for (const row of rows) {
      const symbol = row.symbol.trim().toUpperCase();
      if (!expected.has(symbol) || bySymbol.has(symbol) ||
          !CIK.test(row.issuerId) || !validUtc(row.effectiveAt) ||
          Date.parse(row.effectiveAt) > Date.parse(cycle.researchAsOf)) {
        issues.push(prefix + "INVALID_IDENTITY:" + symbol);
        continue;
      }
      if (byIssuer.has(row.issuerId))
        issues.push(prefix + "DUPLICATE_ISSUER:" + row.issuerId);
      bySymbol.set(symbol, row.issuerId);
      byIssuer.set(row.issuerId, symbol);
      if (symbolIssuer.has(symbol) && symbolIssuer.get(symbol) !== row.issuerId)
        issues.push(prefix + "SYMBOL_REUSED:" + symbol);
      if (issuerSymbols.has(row.issuerId) && issuerSymbols.get(row.issuerId) !== symbol)
        issues.push(prefix + "ISSUER_RENAMED:" + row.issuerId);
      symbolIssuer.set(symbol, row.issuerId);
      issuerSymbols.set(row.issuerId, symbol);
    }
    if (bySymbol.size !== expected.size)
      issues.push(prefix + "INCOMPLETE_UNIVERSE_IDENTITY");
    if (!comparison.accepted) continue;
    const selected = comparison.cycles[index];
    for (const symbol of selected.v1SelectedSymbols) {
      const issuer = bySymbol.get(symbol);
      if (!issuer) continue;
      if (v1Seen.has(issuer)) v1IssuerRepeatSlots++;
      else v1Seen.add(issuer);
    }
    for (const candidate of selected.v2Selected) {
      const issuer = bySymbol.get(candidate.symbol);
      if (!issuer) continue;
      if (v2Seen.has(issuer)) v2IssuerRepeatSlots++;
      else v2Seen.add(issuer);
    }
  }
  if (issues.length || !comparison.accepted) return { accepted: false, issues };
  return { accepted: true, comparison,
    uniqueV1Issuers: v1Seen.size, uniqueV2Issuers: v2Seen.size,
    v1IssuerRepeatSlots, v2IssuerRepeatSlots };
}
