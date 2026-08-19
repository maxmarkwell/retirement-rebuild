"use server";

import { revalidatePath } from "next/cache";
import type { ActionState } from "@/lib/forms/action-state";
import { captureDailySnapshots } from "@/lib/portfolio/snapshots";

export async function captureSnapshotsAction(
  _prevState: ActionState,
  _formData: FormData
): Promise<ActionState> {
  try {
    const result = await captureDailySnapshots();

    revalidatePath("/");

    return {
      success: true,
      message: `Captured ${result.count} portfolio snapshots for ${result.snapshotDate}.`,
    };
  } catch (error) {
    return {
      success: false,
      message:
        error instanceof Error
          ? error.message
          : "Unable to capture portfolio snapshots.",
    };
  }
}