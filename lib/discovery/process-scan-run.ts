import { createClient } from "@/lib/supabase/server";

import {
  getDynamicDiscoveryUniverse,
  type DynamicUniverseStock,
} from "./dynamic-universe";

import {
  preScreenDynamicUniverse,
} from "./pre-screen";

import {
  getLightFundamentals,
  isFmpRateLimitError,
} from "./light-fundamentals";

import {
  evaluateFundamentalScreenCandidate,
  type FundamentalScreenCandidate,
} from "./fundamental-screen";

import {
  selectDeepCandidates,
  type DeepCandidateSelection,
} from "./deep-candidate-selector";

import {
  getCompanyFundamentals,
} from "@/lib/company-data/fmp";

import {
  getCompanyFundamentalTrends,
} from "@/lib/company-data/trends";

import {
  finalizeDiscoveryScan,
} from "./finalize-scan";

import type {
  CompanyFundamentals,
  CompanyFundamentalTrends,
} from "@/lib/company-data/types";

type StoredDeepResearchResult = {
  ticker: string;

  companyName:
    string | null;

  sector:
    string | null;

  industry:
    string | null;

  marketCapBucket:
    DynamicUniverseStock["marketCapBucket"];

  selectorScore:
    number;

  fundamentals:
    CompanyFundamentals | null;

  trends:
    CompanyFundamentalTrends | null;

  error:
    string | null;
};

type ScanState = {
  prescreenTickers?: string[];

  prescreenStocks?: DynamicUniverseStock[];

  fundamentalCursor?: number;

  fundamentalResults?:
    FundamentalScreenCandidate[];

  fundamentalPassedTickers?: string[];

deepCandidateTickers?: string[];

deepCandidates?:
  DeepCandidateSelection["selected"];

deepCursor?: number;

deepResearchResults?:
  StoredDeepResearchResult[];

deepProcessed?: number;
};
export type ProcessDiscoveryScanRunResult = {
  scanRunId: string;

  status:
    | "pending"
    | "running"
    | "completed"
    | "failed";

  stage: string;

  completedStage?: string;
  nextStage?: string;

  universeCount?: number;
  prescreenCount?: number;

  fundamentalProcessed?: number;
  fundamentalTotal?: number;
  fundamentalPassed?: number;

  deepCandidateCount?: number;
  deepProcessed?: number;
deepTotal?: number;
deepCompleted?: number;
deepFailed?: number;

  message?: string;
};

function isFmpRateLimitLike(
  error: unknown
) {
  if (
    isFmpRateLimitError(
      error
    )
  ) {
    return true;
  }

  if (
    !(error instanceof Error)
  ) {
    return false;
  }

  const message =
    error.message
      .toLowerCase();

  return (
    message.includes(
      "status 429"
    ) ||
    message.includes(
      "rate limit"
    ) ||
    message.includes(
      "limit reach"
    )
  );
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] =
    new Array(items.length);

  let nextIndex = 0;

  async function runWorker() {
    while (true) {
      const index =
        nextIndex++;

      if (
        index >=
        items.length
      ) {
        return;
      }

      results[index] =
        await worker(
          items[index]
        );
    }
  }

  const workers =
    Array.from(
      {
        length:
          Math.min(
            concurrency,
            items.length
          ),
      },
      () => runWorker()
    );

  await Promise.all(
    workers
  );

  return results;
}

export async function processDiscoveryScanRun(
  scanRunId: string
): Promise<ProcessDiscoveryScanRunResult> {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    throw new Error(
      "You must be signed in."
    );
  }

  if (!scanRunId) {
    throw new Error(
      "scanRunId is required."
    );
  }

  // ---------------------------------------------------------
  // Load scan
  // ---------------------------------------------------------

  const {
    data: scanRun,
    error: scanError,
  } =
    await supabase
      .from(
        "discovery_scan_runs"
      )
      .select(
        `
        id,
        user_id,
        portfolio_type,
        status,
        stage,
        state,
        universe_count,
        prescreen_count,
        fundamental_count
        `
      )
      .eq(
        "id",
        scanRunId
      )
      .eq(
        "user_id",
        user.id
      )
      .single();

  if (
    scanError ||
    !scanRun
  ) {
    throw new Error(
      scanError?.message ??
      "Discovery scan not found."
    );
  }

  // ---------------------------------------------------------
  // Guard completed / failed scans
  // ---------------------------------------------------------

  if (
    scanRun.status ===
    "completed"
  ) {
    return {
      scanRunId:
        scanRun.id,

      status:
        "completed",

      stage:
        scanRun.stage,

      message:
        "Discovery scan is already complete.",
    };
  }

  if (
    scanRun.status ===
    "failed"
  ) {
    throw new Error(
      "Discovery scan has already failed."
    );
  }

  // ---------------------------------------------------------
  // Stage 1
  // Dynamic universe + pre-screen
  // ---------------------------------------------------------

  if (
    scanRun.stage ===
      "starting" ||
    scanRun.stage ===
      "universe"
  ) {
    const {
      error: runningUpdateError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .update({
          status:
            "running",

          stage:
            "universe",
        })
        .eq(
          "id",
          scanRun.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (
      runningUpdateError
    ) {
      throw new Error(
        `Unable to start Discovery V2 universe stage: ${runningUpdateError.message}`
      );
    }

    const universe =
      await getDynamicDiscoveryUniverse();

    const preScreen =
      preScreenDynamicUniverse(
        universe
      );

    const existingState =
      (
        scanRun.state ??
        {}
      ) as ScanState;

   const nextState:
  ScanState = {
    ...existingState,

    prescreenTickers:
      preScreen.selected.map(
        (stock) =>
          stock.ticker
      ),

    prescreenStocks:
      preScreen.selected,

    fundamentalCursor:
      0,

    fundamentalResults:
      [],

    fundamentalPassedTickers:
      [],
  };
    const {
      error: updateError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .update({
          status:
            "running",

          stage:
            "fundamentals",

          universe_count:
            universe.length,

          prescreen_count:
            preScreen.selectedCount,

          fundamental_count:
            0,

          state:
            nextState,
        })
        .eq(
          "id",
          scanRun.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (updateError) {
      throw new Error(
        `Unable to update Discovery V2 scan: ${updateError.message}`
      );
    }

    return {
      scanRunId:
        scanRun.id,

      status:
        "running",

      stage:
        "fundamentals",

      completedStage:
        "universe",

      nextStage:
        "fundamentals",

      universeCount:
        universe.length,

      prescreenCount:
        preScreen.selectedCount,
    };
  }

  // ---------------------------------------------------------
  // Stage 2
  // Light fundamentals — resumable batch
  // ---------------------------------------------------------

  if (
    scanRun.stage ===
    "fundamentals"
  ) {
    const state =
      (
        scanRun.state ??
        {}
      ) as ScanState;

    const prescreenTickers =
      state.prescreenTickers ??
      [];

    if (
      prescreenTickers.length ===
      0
    ) {
      throw new Error(
        "Discovery scan does not contain pre-screen tickers."
      );
    }

    const cursor =
      state.fundamentalCursor ??
      0;

    /*
      Twenty companies per request.

      Each currently requires approximately
      three FMP calls, so one worker request
      generates roughly sixty FMP calls.
    */

    const batchSize = 20;

    const batchTickers =
      prescreenTickers.slice(
        cursor,
        cursor + batchSize
      );

    /*
      If the cursor is already at the end,
      advance immediately to deep selection.
    */

    if (
      batchTickers.length ===
      0
    ) {
      const existingResults =
        state.fundamentalResults ??
        [];

      const passed =
        existingResults.filter(
          (candidate) =>
            candidate.passed
        );

      const nextState:
        ScanState = {
        ...state,

        fundamentalPassedTickers:
          passed.map(
            (candidate) =>
              candidate.stock
                .ticker
          ),
      };

      const {
        error: advanceError,
      } =
        await supabase
          .from(
            "discovery_scan_runs"
          )
          .update({
            stage:
              "deep_selection",

            fundamental_count:
              passed.length,

            state:
              nextState,
          })
          .eq(
            "id",
            scanRun.id
          )
          .eq(
            "user_id",
            user.id
          );

      if (advanceError) {
        throw new Error(
          `Unable to advance Discovery V2 scan: ${advanceError.message}`
        );
      }

      return {
        scanRunId:
          scanRun.id,

        status:
          "running",

        stage:
          "deep_selection",

        completedStage:
          "fundamentals",

        nextStage:
          "deep_selection",

        fundamentalProcessed:
          prescreenTickers.length,

        fundamentalTotal:
          prescreenTickers.length,

        fundamentalPassed:
          passed.length,
      };
    }

    /*
      Rehydrate stock metadata from the cached
      dynamic universe.

      This keeps the scan state smaller while
      preserving the authoritative sector,
      industry and market-cap bucket metadata.
    */

 const prescreenStocks =
  state.prescreenStocks ??
  [];

const stockByTicker =
  new Map(
    prescreenStocks.map(
      (stock) => [
        stock.ticker,
        stock,
      ]
    )
  );

const batchStocks =
  batchTickers
    .map(
      (ticker) =>
        stockByTicker.get(
          ticker
        ) ??
        null
    )
    .filter(
      (
        stock
      ): stock is DynamicUniverseStock =>
        stock != null
    );

    const batchResults =
  await mapWithConcurrency(
    batchStocks,
    4,
    async (stock) => {
      try {
        const fundamentals =
          await getLightFundamentals(
            stock.ticker
          );

        if (
          fundamentals.freeCashFlow !=
            null &&
          stock.marketCap > 0
        ) {
          fundamentals.freeCashFlowYieldPct =
            (
              fundamentals.freeCashFlow /
              stock.marketCap
            ) * 100;
        } else {
          fundamentals.freeCashFlowYieldPct =
            null;
        }

        return {
          type:
            "candidate" as const,

          candidate:
            evaluateFundamentalScreenCandidate(
              stock,
              fundamentals
            ),
        };
      } catch (error) {
        if (
          isFmpRateLimitError(
            error
          )
        ) {
          return {
            type:
              "rate_limit" as const,

            ticker:
              stock.ticker,

            message:
              error.message,
          };
        }

        return {
          type:
            "candidate" as const,

          candidate: {
            stock,

            fundamentals: {
              ticker:
                stock.ticker,

              revenue:
                null,

              revenueGrowthPct:
                null,

              operatingMarginPct:
                null,

              freeCashFlow:
                null,

              netDebtToEbitda:
                null,

              returnOnInvestedCapitalPct:
                null,

              freeCashFlowYieldPct:
                null,
            },

            passed:
              false,

            reasons: [
              error instanceof Error
                ? error.message
                : "Unable to load light fundamentals.",
            ],
          },
        };
      }
    }
  );       
    
const firstRateLimitIndex =
  batchResults.findIndex(
    (result) =>
      result.type ===
      "rate_limit"
  );

const safeBatchResults =
  firstRateLimitIndex >= 0
    ? batchResults.slice(
        0,
        firstRateLimitIndex
      )
    : batchResults;

const completedCandidates =
  safeBatchResults
    .filter(
      (
        result
      ): result is Extract<
        (typeof safeBatchResults)[number],
        {
          type: "candidate";
        }
      > =>
        result.type ===
        "candidate"
    )
    .map(
      (result) =>
        result.candidate
    );


    const previousResults =
      state.fundamentalResults ??
      [];

const allResults = [
  ...previousResults,
  ...completedCandidates,
];

const nextCursor =
  cursor +
  completedCandidates.length;

    const passed =
      allResults.filter(
        (candidate) =>
          candidate.passed
      );

if (
  firstRateLimitIndex >= 0
) {
  const nextState:
    ScanState = {
    ...state,

    fundamentalCursor:
      nextCursor,

    fundamentalResults:
      allResults,

    fundamentalPassedTickers:
      passed.map(
        (candidate) =>
          candidate.stock
            .ticker
      ),
  };

  const {
    error: pauseError,
  } =
    await supabase
      .from(
        "discovery_scan_runs"
      )
      .update({
        status:
          "running",

        stage:
          "fundamentals",

        fundamental_count:
          passed.length,

        state:
          nextState,
      })
      .eq(
        "id",
        scanRun.id
      )
      .eq(
        "user_id",
        user.id
      );

  if (pauseError) {
    throw new Error(
      `Unable to save Discovery V2 rate-limit checkpoint: ${pauseError.message}`
    );
  }

  return {
    scanRunId:
      scanRun.id,

    status:
      "running",

    stage:
      "fundamentals",

    nextStage:
      "fundamentals",

    fundamentalProcessed:
      nextCursor,

    fundamentalTotal:
      prescreenTickers.length,

    fundamentalPassed:
      passed.length,

    message:
      `FMP rate limit reached. Fundamentals paused safely at ${nextCursor} of ${prescreenTickers.length}. Wait briefly, then Process Scan again.`,
  };
}

    const fundamentalsComplete =
      nextCursor >=
      prescreenTickers.length;

    const nextStage =
      fundamentalsComplete
        ? "deep_selection"
        : "fundamentals";

    const nextState:
      ScanState = {
      ...state,

      fundamentalCursor:
        nextCursor,

      fundamentalResults:
        allResults,

      fundamentalPassedTickers:
        passed.map(
          (candidate) =>
            candidate.stock
              .ticker
        ),
    };

    const {
      error: updateError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .update({
          status:
            "running",

          stage:
            nextStage,

          /*
            During the stage this represents
            how many candidates have passed
            so far. At completion it becomes
            the final light-screen survivor
            count.
          */

          fundamental_count:
            passed.length,

          state:
            nextState,
        })
        .eq(
          "id",
          scanRun.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (updateError) {
      throw new Error(
        `Unable to save Discovery V2 fundamental batch: ${updateError.message}`
      );
    }

    return {
      scanRunId:
        scanRun.id,

      status:
        "running",

      stage:
        nextStage,

      completedStage:
        fundamentalsComplete
          ? "fundamentals"
          : undefined,

      nextStage,

      fundamentalProcessed:
        nextCursor,

      fundamentalTotal:
        prescreenTickers.length,

      fundamentalPassed:
        passed.length,

      message:
        fundamentalsComplete
          ? `Fundamental screening complete: ${passed.length} of ${prescreenTickers.length} companies passed.`
          : `Fundamentals processed: ${nextCursor} of ${prescreenTickers.length}. ${passed.length} currently pass.`,
    };
  }

  // ---------------------------------------------------------
// Stage 3
// Select candidates for full deep research
// ---------------------------------------------------------

if (
  scanRun.stage ===
  "deep_selection"
) {
  const state =
    (
      scanRun.state ??
      {}
    ) as ScanState;

  const fundamentalResults =
    state.fundamentalResults ??
    [];

  if (
    fundamentalResults.length ===
    0
  ) {
    throw new Error(
      "Discovery scan does not contain fundamental screening results."
    );
  }

  const passed =
    fundamentalResults.filter(
      (candidate) =>
        candidate.passed
    );

  if (
    passed.length ===
    0
  ) {
    throw new Error(
      "No companies passed the light fundamental screen."
    );
  }

  const selection =
    selectDeepCandidates(
      passed
    );

  const nextState:
    ScanState = {
    ...state,

    deepCandidateTickers:
      selection.selected.map(
        (item) =>
          item.candidate.stock
            .ticker
      ),

    deepCandidates:
      selection.selected,

deepCursor:
  0,

deepResearchResults:
  [],

deepProcessed:
  0,
  };

  const {
    error: updateError,
  } =
    await supabase
      .from(
        "discovery_scan_runs"
      )
      .update({
        status:
          "running",

        stage:
          "deep_research",

        deep_candidate_count:
          selection.selectedCount,

        state:
          nextState,
      })
      .eq(
        "id",
        scanRun.id
      )
      .eq(
        "user_id",
        user.id
      );

  if (updateError) {
    throw new Error(
      `Unable to save Discovery V2 deep candidate selection: ${updateError.message}`
    );
  }

  return {
    scanRunId:
      scanRun.id,

    status:
      "running",

    stage:
      "deep_research",

    completedStage:
      "deep_selection",

    nextStage:
      "deep_research",

    deepCandidateCount:
      selection.selectedCount,

    message:
      `Deep candidate selection complete: ${selection.selectedCount} of ${passed.length} fundamental survivors selected for full research.`,
  };
}

// ---------------------------------------------------------
// Stage 4
// Full fundamentals + historical trends
// Resumable and rate-limit safe
// ---------------------------------------------------------

if (
  scanRun.stage ===
  "deep_research"
) {
  const state =
    (
      scanRun.state ??
      {}
    ) as ScanState;

  const deepCandidates =
    state.deepCandidates ??
    [];

  if (
    deepCandidates.length ===
    0
  ) {
    throw new Error(
      "Discovery scan does not contain deep research candidates."
    );
  }

  const cursor =
    state.deepCursor ??
    0;

  /*
    Full research is much heavier than the
    light fundamental screen.

    Keep each request deliberately small.
  */

  const batchSize = 5;

  const batch =
    deepCandidates.slice(
      cursor,
      cursor + batchSize
    );

  /*
    If everything has already been processed,
    advance to deep scoring.
  */

  if (
    batch.length ===
    0
  ) {
    const results =
      state.deepResearchResults ??
      [];

    const completed =
      results.filter(
        (result) =>
          result.error == null &&
          result.fundamentals != null &&
          result.trends != null
      );

    const failed =
      results.filter(
        (result) =>
          result.error != null
      );

    const {
      error: advanceError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .update({
          status:
            "running",

          stage:
            "deep_scoring",

          completed_count:
            completed.length,

          failed_count:
            failed.length,

          state,
        })
        .eq(
          "id",
          scanRun.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (advanceError) {
      throw new Error(
        `Unable to advance Discovery V2 deep research: ${advanceError.message}`
      );
    }

    return {
      scanRunId:
        scanRun.id,

      status:
        "running",

      stage:
        "deep_scoring",

      completedStage:
        "deep_research",

      nextStage:
        "deep_scoring",

      deepProcessed:
        deepCandidates.length,

      deepTotal:
        deepCandidates.length,

      deepCompleted:
        completed.length,

      deepFailed:
        failed.length,

      message:
        `Deep research complete: ${completed.length} completed, ${failed.length} failed.`,
    };
  }

  const batchResults =
    await mapWithConcurrency(
      batch,
      2,
      async (item) => {
        const stock =
          item.candidate.stock;

        try {
          const [
            fundamentals,
            trends,
          ] =
            await Promise.all([
              getCompanyFundamentals(
                stock.ticker
              ),

              getCompanyFundamentalTrends(
                stock.ticker
              ),
            ]);

          return {
            type:
              "result" as const,

            result: {
              ticker:
                stock.ticker,

              companyName:
                stock.companyName,

              sector:
                stock.sector,

              industry:
                stock.industry,

              marketCapBucket:
                stock.marketCapBucket,

              selectorScore:
                item.score.score,

              fundamentals,

              trends,

              error:
                null,
            } satisfies StoredDeepResearchResult,
          };
        } catch (error) {
          if (
            isFmpRateLimitLike(
              error
            )
          ) {
            return {
              type:
                "rate_limit" as const,

              ticker:
                stock.ticker,

              message:
                error instanceof Error
                  ? error.message
                  : "FMP rate limit reached.",
            };
          }

          return {
            type:
              "result" as const,

            result: {
              ticker:
                stock.ticker,

              companyName:
                stock.companyName,

              sector:
                stock.sector,

              industry:
                stock.industry,

              marketCapBucket:
                stock.marketCapBucket,

              selectorScore:
                item.score.score,

              fundamentals:
                null,

              trends:
                null,

              error:
                error instanceof Error
                  ? error.message
                  : "Unknown deep research error.",
            } satisfies StoredDeepResearchResult,
          };
        }
      }
    );

  // -------------------------------------------------------
  // Detect first rate limit in this ordered batch
  // -------------------------------------------------------

  const firstRateLimitIndex =
    batchResults.findIndex(
      (result) =>
        result.type ===
        "rate_limit"
    );

  /*
    Preserve only results before the first
    rate-limited position.

    Anything at or after that point will be
    retried on the next worker execution.
  */

  const safeBatchResults =
    firstRateLimitIndex >= 0
      ? batchResults.slice(
          0,
          firstRateLimitIndex
        )
      : batchResults;

  const completedBatchResults =
    safeBatchResults
      .filter(
        (
          result
        ): result is Extract<
          (typeof safeBatchResults)[number],
          {
            type: "result";
          }
        > =>
          result.type ===
          "result"
      )
      .map(
        (result) =>
          result.result
      );

  const previousResults =
    state.deepResearchResults ??
    [];

  const allResults = [
    ...previousResults,
    ...completedBatchResults,
  ];

  const nextCursor =
    cursor +
    completedBatchResults.length;

  const completed =
    allResults.filter(
      (result) =>
        result.error == null &&
        result.fundamentals != null &&
        result.trends != null
    );

  const failed =
    allResults.filter(
      (result) =>
        result.error != null
    );

  // -------------------------------------------------------
  // Rate-limit pause
  // -------------------------------------------------------

  if (
    firstRateLimitIndex >= 0
  ) {
    const nextState:
      ScanState = {
      ...state,

      deepCursor:
        nextCursor,

      deepProcessed:
        nextCursor,

      deepResearchResults:
        allResults,
    };

    const {
      error: pauseError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .update({
          status:
            "running",

          stage:
            "deep_research",

          completed_count:
            completed.length,

          failed_count:
            failed.length,

          state:
            nextState,
        })
        .eq(
          "id",
          scanRun.id
        )
        .eq(
          "user_id",
          user.id
        );

    if (pauseError) {
      throw new Error(
        `Unable to save Discovery V2 deep-research checkpoint: ${pauseError.message}`
      );
    }

    return {
      scanRunId:
        scanRun.id,

      status:
        "running",

      stage:
        "deep_research",

      nextStage:
        "deep_research",

      deepProcessed:
        nextCursor,

      deepTotal:
        deepCandidates.length,

      deepCompleted:
        completed.length,

      deepFailed:
        failed.length,

      message:
        `FMP rate limit reached. Deep research paused safely at ${nextCursor} of ${deepCandidates.length}. Wait briefly, then Process Scan again.`,
    };
  }

  // -------------------------------------------------------
  // Normal batch completion
  // -------------------------------------------------------

  const deepResearchComplete =
    nextCursor >=
    deepCandidates.length;

  const nextStage =
    deepResearchComplete
      ? "deep_scoring"
      : "deep_research";

  const nextState:
    ScanState = {
    ...state,

    deepCursor:
      nextCursor,

    deepProcessed:
      nextCursor,

    deepResearchResults:
      allResults,
  };

  const {
    error: updateError,
  } =
    await supabase
      .from(
        "discovery_scan_runs"
      )
      .update({
        status:
          "running",

        stage:
          nextStage,

        completed_count:
          completed.length,

        failed_count:
          failed.length,

        state:
          nextState,
      })
      .eq(
        "id",
        scanRun.id
      )
      .eq(
        "user_id",
        user.id
      );

  if (updateError) {
    throw new Error(
      `Unable to save Discovery V2 deep research batch: ${updateError.message}`
    );
  }

  return {
    scanRunId:
      scanRun.id,

    status:
      "running",

    stage:
      nextStage,

    completedStage:
      deepResearchComplete
        ? "deep_research"
        : undefined,

    nextStage,

    deepProcessed:
      nextCursor,

    deepTotal:
      deepCandidates.length,

    deepCompleted:
      completed.length,

    deepFailed:
      failed.length,

    message:
      deepResearchComplete
        ? `Deep research complete: ${completed.length} completed, ${failed.length} failed.`
        : `Deep research processed: ${nextCursor} of ${deepCandidates.length}. ${completed.length} completed, ${failed.length} failed.`,
  };
}

// ---------------------------------------------------------
// Stage 5
// Deep scoring + portfolio fit + persistence
// ---------------------------------------------------------

if (
  scanRun.stage ===
  "deep_scoring"
) {
  const state =
    (
      scanRun.state ??
      {}
    ) as ScanState;

  const deepResearchResults =
    state.deepResearchResults ??
    [];

  if (
    deepResearchResults.length ===
    0
  ) {
    throw new Error(
      "Discovery scan does not contain deep research results."
    );
  }

  const portfolioMode =
    scanRun.portfolio_type as
      | "paper_active"
      | "paper_long_term";

  const result =
    await finalizeDiscoveryScan(
      scanRun.id,
      portfolioMode,
      deepResearchResults
    );

  return {
    scanRunId:
      scanRun.id,

    status:
      "completed",

    stage:
      "completed",

    completedStage:
      "deep_scoring",

    nextStage:
      "completed",

    deepProcessed:
      deepResearchResults.length,

    deepTotal:
      deepResearchResults.length,

    deepCompleted:
      result.completedCount,

    deepFailed:
      deepResearchResults.length -
      result.completedCount,

    message:
      `Discovery V2 complete: ${result.savedCount} candidates saved.`,
  };
}

// ---------------------------------------------------------
  // Later stages not wired yet
  // ---------------------------------------------------------

  return {
    scanRunId:
      scanRun.id,

    status:
      scanRun.status,

    stage:
      scanRun.stage,

    message:
      `Worker for stage "${scanRun.stage}" has not been added yet.`,
  };
}