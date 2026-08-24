import {
  NextResponse,
} from "next/server";
import {
  runFundamentalScreen,
} from "@/lib/discovery/fundamental-screen";
import {
  selectDeepCandidates,
} from "@/lib/discovery/deep-candidate-selector";

export async function GET() {
  try {
    const fundamentalScreen =
      await runFundamentalScreen();

    const selection =
      selectDeepCandidates(
        fundamentalScreen.passed
      );

    return NextResponse.json({
      inputCount:
        selection.inputCount,

      selectedCount:
        selection.selectedCount,

      bucketCounts:
        selection.bucketCounts,

      topOverall:
        selection.selected.slice(
          0,
          20
        ),

      topSmall:
        selection.selected
          .filter(
            (item) =>
              item.candidate.stock
                .marketCapBucket ===
              "small"
          )
          .slice(0, 10),

      topMid:
        selection.selected
          .filter(
            (item) =>
              item.candidate.stock
                .marketCapBucket ===
              "mid"
          )
          .slice(0, 10),
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to select deep candidates.",
      },
      {
        status: 500,
      }
    );
  }
}