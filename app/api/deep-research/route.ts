import {
  NextResponse,
} from "next/server";
import {
  runDeepResearch,
} from "@/lib/discovery/deep-research";

export async function GET() {
  try {
    const result =
      await runDeepResearch();

    return NextResponse.json({
      inputCount:
        result.inputCount,

      completedCount:
        result.completedCount,

      failedCount:
        result.failedCount,

      sample:
        result.candidates
          .filter(
            (candidate) =>
              candidate.error ==
              null
          )
          .slice(
            0,
            15
          ),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to run deep research.",
      },
      {
        status: 500,
      }
    );
  }
}