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

    return NextResponse.json({
      success: true,
      snapshotDate:
        result.snapshotDate,
      count: result.count,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to capture daily snapshots.";

    return NextResponse.json(
      {
        error: message,
      },
      {
        status: 500,
      }
    );
  }
}