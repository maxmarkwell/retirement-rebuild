import {
  NextRequest,
  NextResponse,
} from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import { refreshSnapshotQuotesForUser } from "@/lib/portfolio/snapshots";

export async function GET(
  request: NextRequest
) {
  const authHeader =
    request.headers.get("authorization");

  const expectedSecret =
    process.env.CRON_SECRET;

  const snapshotUserId =
    process.env.SNAPSHOT_USER_ID;

  if (!expectedSecret) {
    return NextResponse.json(
      {
        error:
          "CRON_SECRET is not configured.",
      },
      {
        status: 500,
      }
    );
  }

  if (!snapshotUserId) {
    return NextResponse.json(
      {
        error:
          "SNAPSHOT_USER_ID is not configured.",
      },
      {
        status: 500,
      }
    );
  }

  if (
    authHeader !==
    `Bearer ${expectedSecret}`
  ) {
    return NextResponse.json(
      {
        error: "Unauthorized.",
      },
      {
        status: 401,
      }
    );
  }

  try {
    const supabase =
      createAdminClient();

    const result =
      await refreshSnapshotQuotesForUser(
        snapshotUserId,
        supabase
      );

    return NextResponse.json({
      success: true,
      snapshotDate:
        result.snapshotDate,
      heldTickerCount:
        result.heldTickers.length,
      freshTickerCount:
        result.freshTickers.length,
      refreshedTickers:
        result.refreshedTickers,
      remainingTickerCount:
        result.missingTickers.length,
    });
  } catch (error) {
    console.error(
      "Snapshot quote prewarm failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to refresh snapshot market prices.",
      },
      {
        status: 500,
      }
    );
  }
}