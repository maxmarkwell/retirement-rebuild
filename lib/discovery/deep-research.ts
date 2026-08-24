import {
  getCompanyFundamentals,
} from "@/lib/company-data/fmp";

import {
  getCompanyFundamentalTrends,
} from "@/lib/company-data/trends";

import type {
  CompanyFundamentals,
  CompanyFundamentalTrends,
} from "@/lib/company-data/types";

import type {
  DeepCandidateSelection,
} from "./deep-candidate-selector";

import {
  runFundamentalScreen,
} from "./fundamental-screen";

import {
  selectDeepCandidates,
} from "./deep-candidate-selector";

import type {
  MarketCapBucket,
} from "./dynamic-universe";

export type DeepResearchCandidate = {
  ticker: string;

  companyName:
    string | null;

  sector:
    string | null;

  industry:
    string | null;

  marketCapBucket:
    MarketCapBucket;

  fundamentals:
    CompanyFundamentals | null;

  trends:
    CompanyFundamentalTrends | null;

  selectorScore:
    number;

  error:
    string | null;
};

export type DeepResearchResult = {
  inputCount: number;
  completedCount: number;
  failedCount: number;

  candidates:
    DeepResearchCandidate[];
};

function sleep(
  milliseconds: number
) {
  return new Promise<void>(
    (resolve) => {
      setTimeout(
        resolve,
        milliseconds
      );
    }
  );
}

async function researchCandidate(
  item:
    DeepCandidateSelection["selected"][number]
): Promise<DeepResearchCandidate> {
  const stock =
    item.candidate.stock;

  const ticker =
    stock.ticker;

  try {
    const [
      fundamentals,
      trends,
    ] = await Promise.all([
      getCompanyFundamentals(
        ticker
      ),

      getCompanyFundamentalTrends(
        ticker
      ),
    ]);

    return {
      ticker,

      companyName:
        stock.companyName,

      sector:
        stock.sector,

      industry:
        stock.industry,

      marketCapBucket:
        stock.marketCapBucket,

      fundamentals,

      trends,

      selectorScore:
        item.score.score,

      error:
        null,
    };
  } catch (error) {
    return {
      ticker,

      companyName:
        stock.companyName,

      sector:
        stock.sector,

      industry:
        stock.industry,

      marketCapBucket:
        stock.marketCapBucket,

      fundamentals:
        null,

      trends:
        null,

      selectorScore:
        item.score.score,

      error:
        error instanceof Error
          ? error.message
          : "Unknown deep research error.",
    };
  }
}

export async function runDeepResearch(): Promise<
  DeepResearchResult
> {
  const fundamentalScreen =
    await runFundamentalScreen();

  const selection =
    selectDeepCandidates(
      fundamentalScreen.passed
    );

  const researched:
    DeepResearchCandidate[] =
    [];

  const batchSize = 10;

  /*
    Full fundamentals + five-year trends are
    substantially heavier than the light screen.

    We deliberately process smaller batches
    and pause between them to keep the FMP
    request rate controlled.
  */

  for (
    let start = 0;
    start <
    selection.selected.length;
    start += batchSize
  ) {
    const batch =
      selection.selected.slice(
        start,
        start + batchSize
      );

    const batchResults =
      await Promise.all(
        batch.map(
          (item) =>
            researchCandidate(
              item
            )
        )
      );

    researched.push(
      ...batchResults
    );

    const hasMore =
      start +
        batchSize <
      selection.selected.length;

    if (hasMore) {
      await sleep(
        15_000
      );
    }
  }

  const completed =
    researched.filter(
      (candidate) =>
        candidate.error == null &&
        candidate.fundamentals != null &&
        candidate.trends != null
    );

  const failed =
    researched.filter(
      (candidate) =>
        candidate.error != null
    );

  return {
    inputCount:
      selection.selectedCount,

    completedCount:
      completed.length,

    failedCount:
      failed.length,

    candidates:
      researched,
  };
}