import {
  NextRequest,
  NextResponse,
} from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { captureDailySnapshotsForUser } from "@/lib/portfolio/snapshots";

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
      await captureDailySnapshotsForUser(
        snapshotUserId,
        supabase
      );

    const complete = result.skippedPortfolioNames.length === 0;
    if (!complete) {
      console.error("Daily snapshot incomplete:", {
        date: result.snapshotDate,
        skippedPortfolioNames: result.skippedPortfolioNames,
        missingTickers: result.missingTickers,
      });
    }
    return NextResponse.json({
      success: complete,
      snapshotDate: result.snapshotDate,
      count: result.count,
      skippedPortfolioNames: result.skippedPortfolioNames,
      missingTickers: result.missingTickers,
    }, { status: complete ? 200 : 503 });
  } catch (error) {
    console.error(
      "Daily snapshot failed:",
      error
    );

    return NextResponse.json(
      {
        error:
          "Unable to complete the daily portfolio snapshot.",
      },
      {
        status: 500,
      }
    );
  }
}