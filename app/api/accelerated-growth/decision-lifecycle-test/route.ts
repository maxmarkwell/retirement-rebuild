import { NextResponse } from "next/server";
import { getAgDecisionLifecycleAction, toAgPersistedDecisionType } from "@/lib/discovery/accelerated-growth/decision-lifecycle";

export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "AG decision lifecycle diagnostic is disabled in production." }, { status: 404 });
  }

  const cases = [
    { name: "watchToBuy", existing: "watch", next: "BUY" as const, expected: "INSERT_SUPERSEDING" },
    { name: "buyToWatch", existing: "buy", next: "WATCH" as const, expected: "INSERT_SUPERSEDING" },
    { name: "watchToReject", existing: "watch", next: "REJECT" as const, expected: "INSERT_SUPERSEDING" },
    { name: "sameWatchRerun", existing: "watch", next: "WATCH" as const, expected: "REUSE" },
    { name: "sameBuyRerun", existing: "buy", next: "BUY" as const, expected: "REUSE" },
    { name: "sameRejectRerun", existing: "avoid", next: "REJECT" as const, expected: "REUSE" },
  ].map((test) => {
    const actual = getAgDecisionLifecycleAction({
      existingActiveDecisionType: test.existing,
      nextDecision: test.next,
    });
    return { ...test, actual, passed: actual === test.expected };
  });

  const rejectPersistsAsAvoid = toAgPersistedDecisionType("REJECT") === "avoid";

  return NextResponse.json({
    decisionLifecycleDiagnostic: true,
    zeroWrite: true,
    cases,
    rejectPersistsAsAvoid,
    passed: cases.every((test) => test.passed) && rejectPersistsAsAvoid,
  });
}
