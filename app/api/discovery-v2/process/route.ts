import {
  NextRequest,
  NextResponse,
} from "next/server";

import {
  processDiscoveryScanRun,
} from "@/lib/discovery/process-scan-run";

export async function POST(
  request: NextRequest
) {
  try {
    const body =
      (await request.json()) as {
        scanRunId?: string;
      };

    const scanRunId =
      body.scanRunId;

    if (!scanRunId) {
      return NextResponse.json(
        {
          error:
            "scanRunId is required.",
        },
        {
          status: 400,
        }
      );
    }

    const result =
      await processDiscoveryScanRun(
        scanRunId
      );

    return NextResponse.json(
      result
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to process Discovery V2 scan.";

    console.error(
      "Discovery V2 worker failed:",
      error
    );

    const status =
      message ===
      "You must be signed in."
        ? 401
        : 500;

    return NextResponse.json(
      {
        error:
          message,
      },
      {
        status,
      }
    );
  }
}