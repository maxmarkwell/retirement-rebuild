import { notFound } from "next/navigation";
import SharedContributionPreview from "@/components/shared-contribution-preview";

// Only the disposable CI Next instance sets this flag. No production route output.
export default function BrowserTestPage() {
  if (process.env.SHARED_CONTRIBUTION_BROWSER_TEST_ENABLED !== "true") notFound();
  return <main className="mx-auto max-w-2xl p-8"><SharedContributionPreview currentSharedCash={100} postingUiEnabled={process.env.SHARED_CONTRIBUTION_POSTING_ENABLED === "true" && process.env.SHARED_CONTRIBUTION_UI_ENABLED === "true"} /></main>;
}
