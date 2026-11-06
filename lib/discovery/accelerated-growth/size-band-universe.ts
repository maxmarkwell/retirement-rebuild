/**
 * Breadth coverage across four market-cap strata, NOT path quotas, ranking or
 * a substitute for market-wide discovery. All ranges are USD and have no
 * claim of complete coverage when pages are capped.
 */
import {
  collectAgUniverse, AG_UNIVERSE_FILTERS, AG_UNIVERSE_SOURCE,
  type RawScreenerRow, type UniverseIntake, type IntakeCandidate,
} from "./universe-intake";

export const AG_BANDED_UNIVERSE_VERSION = "ag-size-band-universe-v1";
export type SizeBand = {
  id: "small" | "lower_mid" | "upper_mid" | "large";
  minExclusiveUsd: number;
  maxExclusiveUsd: number | null;
};
export const SIZE_BANDS: readonly SizeBand[] = [
  { id: "small", minExclusiveUsd: 50_000_000, maxExclusiveUsd: 1_000_000_000 },
  { id: "lower_mid", minExclusiveUsd: 1_000_000_000, maxExclusiveUsd: 10_000_000_000 },
  { id: "upper_mid", minExclusiveUsd: 10_000_000_000, maxExclusiveUsd: 100_000_000_000 },
  { id: "large", minExclusiveUsd: 100_000_000_000, maxExclusiveUsd: null },
];
export type BandSummary = {
  id: SizeBand["id"];
  minExclusiveUsd: number;
  maxExclusiveUsd: number | null;
  pagesRequested: number;
  pageCounts: number[];
  providerRowsSeen: number;
  eligibleRows: number;
  rejectedRows: number;
  coverage: UniverseIntake["coverage"];
  rejectionReasons: Record<string, number>;
  sectorCount: number;
};
export type BandedUniverseSnapshot = {
  version: typeof AG_BANDED_UNIVERSE_VERSION;
  source: typeof AG_UNIVERSE_SOURCE;
  baseFilters: typeof AG_UNIVERSE_FILTERS;
  startedAt: string;
  finishedAt: string;
  pagesPerBand: number;
  pageSize: number;
  totalProviderRowsSeen: number;
  totalEligible: number;
  totalRejected: number;
  distinctSymbolsSeen: number;
  bandSummaries: BandSummary[];
  sizeBandCoverage: "ALL_FILTERED_BANDS_EXHAUSTED" | "PARTIAL_CAPPED";
  entireMarketVerified: false;
  quoteVerification: false;
  economicRankingPerformed: false;
  investmentDecisionsIssued: 0;
  tradesEnabled: false;
  candidates: Array<IntakeCandidate & { sizeBand: SizeBand["id"] }>;
  limitations: string[];
};
const finite = (x: unknown): x is number =>
  typeof x === "number" && Number.isFinite(x);
const iso = (x: unknown): x is string =>
  typeof x === "string" && !Number.isNaN(Date.parse(x));

export async function collectAgSizeBandUniverse(
  fetchBandPage: (band: SizeBand, page: number, limit: number) => Promise<unknown>,
  options: {
    pagesPerBand: number; pageSize: number; startedAt: string;
    finishedAt: () => string;
  },
): Promise<BandedUniverseSnapshot> {
  if (!options || !iso(options.startedAt) ||
      !Number.isInteger(options.pagesPerBand) ||
      options.pagesPerBand < 1 || options.pagesPerBand > 2 ||
      !Number.isInteger(options.pageSize) ||
      options.pageSize < 1 || options.pageSize > 250 ||
      typeof fetchBandPage !== "function" ||
      typeof options.finishedAt !== "function")
    throw new Error("AG_BANDED_INVALID_SCOPE");

  const bandSummaries: BandSummary[] = [];
  const candidates: BandedUniverseSnapshot["candidates"] = [];
  const symbols = new Set<string>();
  let totalProviderRowsSeen = 0, totalRejected = 0;
  for (const band of SIZE_BANDS) {
    const snapshot = await collectAgUniverse(
      async (page, limit) => {
        const raw = await fetchBandPage(band, page, limit);
        if (!Array.isArray(raw)) throw new Error("AG_BANDED_INVALID_PROVIDER_PAGE");
        // Band ranges are strict so a security cannot be represented twice
        // at a shared boundary. Do not silently drop out-of-band responses.
        for (const row of raw as RawScreenerRow[]) {
          if (!row || typeof row !== "object" || Array.isArray(row) ||
              !finite(row.marketCap) ||
              row.marketCap <= band.minExclusiveUsd ||
              (band.maxExclusiveUsd !== null && row.marketCap >= band.maxExclusiveUsd))
            throw new Error("AG_BANDED_PROVIDER_BOUNDARY_MISMATCH");
        }
        return raw;
      },
      { maxPages: options.pagesPerBand, pageSize: options.pageSize,
        startedAt: options.startedAt, finishedAt: options.finishedAt },
    );
    for (const c of snapshot.candidates) {
      if (symbols.has(c.symbol)) throw new Error("AG_BANDED_DUPLICATE_SYMBOL");
      symbols.add(c.symbol);
      candidates.push({ ...c, sizeBand: band.id });
    }
    totalProviderRowsSeen += snapshot.providerRowsSeen;
    totalRejected += snapshot.rejectedRows;
    bandSummaries.push({
      id: band.id, minExclusiveUsd: band.minExclusiveUsd,
      maxExclusiveUsd: band.maxExclusiveUsd,
      pagesRequested: snapshot.pagesRequested, pageCounts: snapshot.pageCounts,
      providerRowsSeen: snapshot.providerRowsSeen,
      eligibleRows: snapshot.eligibleRows, rejectedRows: snapshot.rejectedRows,
      coverage: snapshot.coverage, rejectionReasons: snapshot.rejectionReasons,
      sectorCount: Object.keys(snapshot.sectorsSeen).length,
    });
  }
  const finishedAt = options.finishedAt();
  if (!iso(finishedAt) || Date.parse(finishedAt) < Date.parse(options.startedAt))
    throw new Error("AG_BANDED_BAD_COMPLETION_TIME");
  return {
    version: AG_BANDED_UNIVERSE_VERSION,
    source: AG_UNIVERSE_SOURCE, baseFilters: AG_UNIVERSE_FILTERS,
    startedAt: options.startedAt, finishedAt,
    pagesPerBand: options.pagesPerBand, pageSize: options.pageSize,
    totalProviderRowsSeen, totalEligible: candidates.length, totalRejected,
    distinctSymbolsSeen: symbols.size, bandSummaries,
    sizeBandCoverage: bandSummaries.every(b=>b.coverage==="PROVIDER_PAGE_EXHAUSTED")
      ? "ALL_FILTERED_BANDS_EXHAUSTED" : "PARTIAL_CAPPED",
    entireMarketVerified: false, quoteVerification: false,
    economicRankingPerformed: false, investmentDecisionsIssued: 0,
    tradesEnabled: false, candidates,
    limitations: [
      "Size banding improves coverage diversity, not economic attractiveness and does not impose opportunity-path quotas.",
      "Only provider-filtered US exchange-listed ordinary equity-like records are included; alternative instruments and global special situations are not covered.",
      "Band boundaries are exclusive and records on exact boundaries are excluded; this means even 'exhausted' bands do not prove full market coverage.",
      "Capped bands and provider limits leave undiscovered market candidates. Report each band independently and do not treat samples as exhaustive.",
      "Vendor prices and market capitalization are not independently verified or synchronized to a dated quote.",
      "This endpoint performs no SEC verification, independent research, scenario valuation, Committee decision, transactions, orders or size allocation.",
    ],
  };
}
