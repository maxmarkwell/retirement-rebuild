"use server";

import {
  revalidatePath,
} from "next/cache";

import {
  createClient,
} from "@/lib/supabase/server";

import type {
  ActionState,
} from "@/lib/forms/action-state";

import type {
  DiscoveryPortfolioMode,
} from "@/lib/discovery/types";

import {
  processDiscoveryScanRun,
} from "@/lib/discovery/process-scan-run";

export async function processDiscoveryAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const scanRunId =
    formData.get(
      "scan_run_id"
    ) as string;

  if (!scanRunId) {
    return {
      success: false,
      message:
        "Scan run ID is required.",
    };
  }

  try {
    const result =
      await processDiscoveryScanRun(
        scanRunId
      );

    revalidatePath(
      "/discovery"
    );

    return {
      success: true,
message:
  result.message ??
  (
    result.nextStage
      ? `Discovery advanced to ${result.nextStage}.`
      : `Discovery stage: ${result.stage}.`
  ),
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to process discovery scan.",
    };
  }
}

export async function runDiscoveryAction(
  _prevState: ActionState,
  formData: FormData
): Promise<ActionState> {
  const portfolioMode =
    formData.get(
      "portfolio_mode"
    ) as DiscoveryPortfolioMode;

  if (
    portfolioMode !==
      "paper_active" &&
    portfolioMode !==
      "paper_long_term"
  ) {
    return {
      success: false,
      message:
        "Select a valid discovery portfolio.",
    };
  }

  try {
    const supabase =
      await createClient();

    const {
      data: { user },
    } =
      await supabase.auth.getUser();

    if (!user) {
      return {
        success: false,
        message:
          "You must be signed in.",
      };
    }

    // -------------------------------------------------------
    // Prevent duplicate active scans for the same portfolio
    // -------------------------------------------------------

    const {
      data: existingRun,
      error:
        existingRunError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .select(
          "id, status, stage"
        )
        .eq(
          "user_id",
          user.id
        )
        .eq(
          "portfolio_type",
          portfolioMode
        )
        .in(
          "status",
          [
            "pending",
            "running",
          ]
        )
        .maybeSingle();

    if (
      existingRunError
    ) {
      throw new Error(
        `Unable to check existing discovery scans: ${existingRunError.message}`
      );
    }

    if (existingRun) {
  return {
    success: true,
    message:
      `Resuming Discovery V2. Current stage: ${existingRun.stage}.`,
    scanRunId:
      existingRun.id,
  };
}

    // -------------------------------------------------------
    // Create Discovery V2 scan run
    // -------------------------------------------------------

    const {
      data: scanRun,
      error: insertError,
    } =
      await supabase
        .from(
          "discovery_scan_runs"
        )
        .insert({
          user_id:
            user.id,

          portfolio_type:
            portfolioMode,

          status:
            "pending",

          stage:
            "starting",

          scoring_version:
            "v2",
        })
        .select(
          "id"
        )
        .single();

    if (
      insertError ||
      !scanRun
    ) {
      throw new Error(
        `Unable to create Discovery V2 scan: ${
          insertError?.message ??
          "Scan run was not created."
        }`
      );
    }

    revalidatePath(
      "/discovery"
    );

    return {
  success: true,
  message:
    "Discovery V2 started.",
  scanRunId:
    scanRun.id,
};
    
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to start discovery.";

    return {
      success: false,
      message:
        `Discovery failed: ${message}`,
    };
  }
}