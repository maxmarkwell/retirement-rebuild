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
} from "./light-fundamentals";

import {
  evaluateFundamentalScreenCandidate,
  type FundamentalScreenCandidate,
} from "./fundamental-screen";

type ScanState = {
  prescreenTickers?: string[];

  prescreenStocks?: DynamicUniverseStock[];

  fundamentalCursor?: number;

  fundamentalResults?:
    FundamentalScreenCandidate[];

  fundamentalPassedTickers?: string[];

  deepCandidateTickers?: string[];

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

  message?: string;
};

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

            /*
              Recalculate FCF yield ourselves
              from the underlying values.
            */

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

            return evaluateFundamentalScreenCandidate(
              stock,
              fundamentals
            );
          } catch (error) {
            return {
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
            };
          }
        }
      );

    const previousResults =
      state.fundamentalResults ??
      [];

    const allResults = [
      ...previousResults,
      ...batchResults,
    ];

    const nextCursor =
      cursor +
      batchTickers.length;

    const passed =
      allResults.filter(
        (candidate) =>
          candidate.passed
      );

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