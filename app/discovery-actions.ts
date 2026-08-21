"use server";

import { revalidatePath } from "next/cache";
import { runAndPersistDiscoveryScan } from "@/lib/discovery/persistence";
import type { ActionState } from "@/lib/forms/action-state";
import type { DiscoveryPortfolioMode } from "@/lib/discovery/types";

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
    const result =
      await runAndPersistDiscoveryScan(
        portfolioMode
      );

    revalidatePath(
      "/discovery"
    );

    return {
      success: true,
      message:
        `Discovery complete: ${result.savedCount} candidates saved, ` +
        `${result.unavailableCount} unavailable, ` +
        `${result.openAiCalls} OpenAI calls.`,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to run discovery.";

    return {
      success: false,
      message:
        `Discovery failed: ${message}`,
    };
  }
}