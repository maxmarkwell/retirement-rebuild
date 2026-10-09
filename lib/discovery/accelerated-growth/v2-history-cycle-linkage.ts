import { verifyV2ArchivedSources, type V2SourcePayload,
  type V2ArchivedManifest } from "./v2-history-source-archive";
import type { V2HistoryCaptureEnvelope } from "./v2-history-capture";

/**
 * Semantic preflight for one archived historical cycle. Hash agreement alone
 * does not establish that the archive describes the supplied research input.
 */
export function verifyV2HistoricalCycleLinkage(
  envelope: V2HistoryCaptureEnvelope,
  manifestUtf8: string,
  payloads: readonly V2SourcePayload[],
): { accepted: boolean; issues: string[] } {
  const archive = verifyV2ArchivedSources(envelope, manifestUtf8, payloads);
  const issues = [...archive.issues];
  if (envelope.history.cycles.length !== 1) issues.push("LINKAGE_REQUIRES_ONE_CYCLE");
  if (issues.length) return { accepted: false, issues };
  const manifest = JSON.parse(manifestUtf8) as V2ArchivedManifest;
  const cycle = envelope.history.cycles[0];
  const mappings = envelope.history.issuerIdentitiesByCycle[0];
  const byId = new Map(payloads.map(p => [p.id, p.utf8]));
  const get = (kind: "V1_CYCLE" | "UNIVERSE" | "ISSUER_MAPPING"): unknown => {
    const entries = manifest.sources.filter(s => s.kind === kind);
    if (entries.length !== 1) {
      issues.push("LINKAGE_SOURCE_KIND_COUNT:" + kind);
      return null;
    }
    try { return JSON.parse(byId.get(entries[0].id)!) as unknown; }
    catch { issues.push("LINKAGE_INVALID_JSON:" + kind); return null; }
  };
  const v1 = get("V1_CYCLE");
  const universe = get("UNIVERSE");
  const identity = get("ISSUER_MAPPING");
  const symbols = cycle.candidates.map(c => c.symbol.trim().toUpperCase()).sort();
  const selected = cycle.v1SelectedSymbols.map(s => s.trim().toUpperCase());
  const sameStrings = (a: unknown, b: string[]) =>
    Array.isArray(a) && a.length === b.length &&
    a.every((s, i) => typeof s === "string" && s === b[i]);
  const record = (v: unknown): v is Record<string, unknown> =>
    !!v && typeof v === "object" && !Array.isArray(v);
  if (!record(v1) || v1.runId !== cycle.runId ||
      v1.capacity !== cycle.capacity || v1.researchAsOf !== cycle.researchAsOf ||
      !sameStrings(v1.selectedSymbols, selected))
    issues.push("LINKAGE_V1_MISMATCH");
  if (!record(universe) || universe.runId !== cycle.runId ||
      universe.researchAsOf !== cycle.researchAsOf ||
      !sameStrings(universe.symbols, symbols))
    issues.push("LINKAGE_UNIVERSE_MISMATCH");
  const expected = [...mappings].map(x => ({ symbol: x.symbol.trim().toUpperCase(),
    issuerId: x.issuerId, effectiveAt: x.effectiveAt }))
    .sort((a, b) => a.symbol.localeCompare(b.symbol));
  const actual = record(identity) && Array.isArray(identity.identities)
    ? identity.identities : null;
  if (!record(identity) || identity.runId !== cycle.runId ||
      identity.researchAsOf !== cycle.researchAsOf ||
      !Array.isArray(actual) || actual.length !== expected.length ||
      actual.some((row, i) => !record(row) ||
        row.symbol !== expected[i].symbol || row.issuerId !== expected[i].issuerId ||
        row.effectiveAt !== expected[i].effectiveAt))
    issues.push("LINKAGE_ISSUER_MISMATCH");
  return { accepted: issues.length === 0, issues };
}
