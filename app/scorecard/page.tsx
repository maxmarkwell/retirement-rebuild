import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

function formatScore(
  value: number | string | null
) {
  if (value == null) {
    return "—";
  }

  return Number(value).toFixed(0);
}

function formatPercent(
  value: number | string | null
) {
  if (value == null) {
    return "—";
  }

  const numericValue =
    Number(value);

  const prefix =
    numericValue > 0
      ? "+"
      : "";

  return `${prefix}${numericValue.toFixed(
    2
  )}%`;
}

function formatMoney(
  value: number | string | null
) {
  if (value == null) {
    return "—";
  }

  return new Intl.NumberFormat(
    "en-US",
    {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }
  ).format(
    Number(value)
  );
}

function formatDate(
  value: string | null
) {
  if (!value) {
    return "—";
  }

  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        "America/Denver",
      year:
        "numeric",
      month:
        "short",
      day:
        "numeric",
    }
  ).format(
    new Date(value)
  );
}

export default async function ScorecardPage() {
  const supabase =
    await createClient();

  const {
    data: { user },
  } =
    await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ---------------------------------------------------------
  // Load AI committee decisions
  // ---------------------------------------------------------

  const {
    data: decisions,
    error: decisionsError,
  } =
    await supabase
      .from(
        "investment_decisions"
      )
      .select(
        `
        id,
        portfolio_id,
        decision_type,
        ticker,
        decision_date,
        decision_price,
        confidence_score,
        risk_level,
        source,
        status
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .eq(
        "source",
        "ai_committee"
      )
      .order(
        "decision_date",
        {
          ascending: false,
        }
      );

  if (
    decisionsError
  ) {
    throw new Error(
      `Unable to load AI decisions: ${decisionsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Load evaluations
  // ---------------------------------------------------------

  const {
    data: evaluations,
    error: evaluationsError,
  } =
    await supabase
      .from(
        "investment_decision_evaluations"
      )
      .select(
        `
        id,
        decision_id,
        evaluation_date,
        evaluation_price,
        return_since_decision_pct,
        thesis_status,
        recommendation_status,
        what_was_right,
        what_was_wrong,
        new_information,
        evaluation_summary,
        source
        `
      )
      .eq(
        "user_id",
        user.id
      )
      .order(
        "evaluation_date",
        {
          ascending: false,
        }
      );

  if (
    evaluationsError
  ) {
    throw new Error(
      `Unable to load decision evaluations: ${evaluationsError.message}`
    );
  }

  // ---------------------------------------------------------
  // Portfolio names
  // ---------------------------------------------------------

  const {
    data: portfolios,
    error: portfoliosError,
  } =
    await supabase
      .from(
        "portfolios"
      )
      .select(
        "id, name"
      );

  if (
    portfoliosError
  ) {
    throw new Error(
      `Unable to load portfolios: ${portfoliosError.message}`
    );
  }

  const portfolioNames =
    new Map(
      (
        portfolios ??
        []
      ).map(
        (portfolio) => [
          portfolio.id,
          portfolio.name,
        ]
      )
    );

  // ---------------------------------------------------------
  // Keep only latest evaluation per decision
  // ---------------------------------------------------------

  const latestEvaluationByDecision =
    new Map<
      string,
      NonNullable<
        typeof evaluations
      >[number]
    >();

  for (
    const evaluation
    of evaluations ?? []
  ) {
    if (
      !latestEvaluationByDecision.has(
        evaluation.decision_id
      )
    ) {
      latestEvaluationByDecision.set(
        evaluation.decision_id,
        evaluation
      );
    }
  }

  const evaluatedDecisions =
    (
      decisions ??
      []
    )
      .map(
        (decision) => ({
          decision,

          evaluation:
            latestEvaluationByDecision.get(
              decision.id
            ) ??
            null,
        })
      )
      .filter(
        (
          item
        ): item is {
          decision:
            NonNullable<
              typeof decisions
            >[number];

          evaluation:
            NonNullable<
              typeof evaluations
            >[number];
        } =>
          item.evaluation !=
          null
      );

    // ---------------------------------------------------------
  // Directional outcome calculations
  //
  // Only BUY and SELL decisions are scored as directional
  // investment outcomes.
  //
  // WATCH / HOLD / AVOID / REBALANCE decisions still appear
  // in the scorecard, but their subsequent price movement is
  // not classified as a committee win or loss.
  // ---------------------------------------------------------

  const directionalEvaluations =
    evaluatedDecisions.filter(
      (item) =>
        item.decision
          .decision_type ===
          "buy" ||
        item.decision
          .decision_type ===
          "sell"
    );

  const returns =
    directionalEvaluations
      .map(
        (item) =>
          item.evaluation
            .return_since_decision_pct
      )
      .filter(
        (
          value
        ): value is
          number | string =>
          value != null &&
          Number.isFinite(
            Number(value)
          )
      )
      .map(
        (value) =>
          Number(value)
      );

  const averageReturn =
    returns.length > 0
      ? returns.reduce(
          (
            total,
            value
          ) =>
            total +
            value,
          0
        ) /
        returns.length
      : null;

  const positiveOutcomes =
    returns.filter(
      (value) =>
        value > 0
    ).length;

  const negativeOutcomes =
    returns.filter(
      (value) =>
        value < 0
    ).length;

  const flatOutcomes =
    returns.filter(
      (value) =>
        value === 0
    ).length;

  const measurableOutcomes =
    positiveOutcomes +
    negativeOutcomes +
    flatOutcomes;

  const positiveRate =
    measurableOutcomes > 0
      ? (
          positiveOutcomes /
          measurableOutcomes
        ) *
        100
      : null;
  const thesisIntact =
    evaluatedDecisions.filter(
      (item) =>
        item.evaluation
          .thesis_status ===
          "intact" ||
        item.evaluation
          .thesis_status ===
          "strengthened"
    ).length;

  const thesisWeakened =
    evaluatedDecisions.filter(
      (item) =>
        item.evaluation
          .thesis_status ===
          "weakened"
    ).length;

  const thesisInvalidated =
    evaluatedDecisions.filter(
      (item) =>
        item.evaluation
          .thesis_status ===
          "invalidated"
    ).length;

  const unevaluatedCount =
    (
      decisions ??
      []
    ).length -
    evaluatedDecisions.length;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            AI Scorecard
          </h1>

          <p className="mt-2 max-w-3xl text-gray-600">
            Measure how AI Investment Committee
            decisions are performing and whether
            the original investment reasoning is
            holding up over time.
          </p>
        </div>

        {/* Top-level scorecard */}

        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              AI Decisions
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {
                decisions
                  ?.length ??
                0
              }
            </p>

            <p className="mt-1 text-xs text-gray-500">
              {
                evaluatedDecisions.length
              }{" "}
              evaluated
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Average Outcome
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {averageReturn != null
                ? formatPercent(
                    averageReturn
                  )
                : "—"}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Signed return versus
              original decision
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Positive Outcomes
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {positiveRate != null
                ? `${positiveRate.toFixed(
                    0
                  )}%`
                : "—"}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              {positiveOutcomes} positive ·{" "}
              {negativeOutcomes} negative
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">
              Thesis Holding Up
            </p>

            <p className="mt-2 text-3xl font-bold text-gray-900">
              {evaluatedDecisions.length >
              0
                ? `${(
                    (
                      thesisIntact /
                      evaluatedDecisions.length
                    ) *
                    100
                  ).toFixed(
                    0
                  )}%`
                : "—"}
            </p>

            <p className="mt-1 text-xs text-gray-500">
              Intact or strengthened
            </p>
          </div>
        </div>

        {/* Evaluation coverage */}

        <div className="mt-8 grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Awaiting Evaluation
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {unevaluatedCount}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Thesis Weakened
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {thesisWeakened}
            </p>
          </div>

          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <p className="text-xs uppercase tracking-wide text-gray-500">
              Thesis Invalidated
            </p>

            <p className="mt-2 text-2xl font-bold text-gray-900">
              {thesisInvalidated}
            </p>
          </div>
        </div>

        {/* Latest evaluations */}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Evaluated AI Decisions
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Latest evaluation for each AI
              Investment Committee decision.
            </p>
          </div>

          {evaluatedDecisions.length ? (
            <div className="divide-y divide-gray-100">
              {evaluatedDecisions.map(
                ({
                  decision,
                  evaluation,
                }) => (
                  <Link
                    key={
                      decision.id
                    }
                    href={`/decisions/${decision.id}`}
                    className="block p-6 transition hover:bg-gray-50"
                  >
                    <div className="grid gap-6 lg:grid-cols-[1fr_auto]">
                      <div>
                        <div className="flex flex-wrap items-center gap-3">
                          <span className="text-lg font-bold text-gray-900">
                            {
                              decision.ticker
                            }
                          </span>

                          <span
                            className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                              decision.decision_type ===
                              "buy"
                                ? "bg-green-50 text-green-700"
                                : decision.decision_type ===
                                    "sell"
                                  ? "bg-red-50 text-red-700"
                                  : decision.decision_type ===
                                      "watch"
                                    ? "bg-yellow-50 text-yellow-700"
                                    : decision.decision_type ===
                                        "hold"
                                      ? "bg-blue-50 text-blue-700"
                                      : "bg-gray-100 text-gray-700"
                            }`}
                          >
                            {
                              decision.decision_type
                            }
                          </span>

                          <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">
                            {
                              evaluation.thesis_status
                            }
                          </span>
                        </div>

                        <p className="mt-1 text-sm text-gray-500">
                          {portfolioNames.get(
                            decision.portfolio_id
                          ) ??
                            "Unknown Portfolio"}
                        </p>

                        <p className="mt-4 max-w-4xl text-sm leading-6 text-gray-700">
                          {
                            evaluation.evaluation_summary
                          }
                        </p>

                        <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-xs text-gray-500">
                          <span>
                            Recommendation:{" "}
                            <span className="font-medium uppercase text-gray-700">
                              {
                                evaluation.recommendation_status
                              }
                            </span>
                          </span>

                          <span>
                            Evaluation:{" "}
                            {formatDate(
                              evaluation.evaluation_date
                            )}
                          </span>

                          <span>
                            Confidence:{" "}
                            {decision.confidence_score !=
                            null
                              ? `${formatScore(
                                  decision.confidence_score
                                )}/100`
                              : "—"}
                          </span>
                        </div>
                      </div>

                      <div className="min-w-48 lg:text-right">
                       <p className="text-xs uppercase tracking-wide text-gray-500">
  {decision.decision_type === "buy" ||
  decision.decision_type === "sell"
    ? "Outcome"
    : "Price Movement"}
</p>

<p
  className={`mt-1 text-2xl font-bold ${
    decision.decision_type === "buy" ||
    decision.decision_type === "sell"
      ? evaluation.return_since_decision_pct !=
          null &&
        Number(
          evaluation.return_since_decision_pct
        ) > 0
        ? "text-green-700"
        : evaluation.return_since_decision_pct !=
              null &&
            Number(
              evaluation.return_since_decision_pct
            ) < 0
          ? "text-red-700"
          : "text-gray-900"
      : "text-gray-900"
  }`}
>
  {formatPercent(
    evaluation.return_since_decision_pct
  )}
</p>

{decision.decision_type !== "buy" &&
  decision.decision_type !== "sell" && (
    <p className="mt-1 text-xs text-gray-500">
      Not included in directional performance
    </p>
  )}
                        <div className="mt-4">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Decision Price
                          </p>

                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {formatMoney(
                              decision.decision_price
                            )}
                          </p>
                        </div>

                        <div className="mt-3">
                          <p className="text-xs uppercase tracking-wide text-gray-500">
                            Evaluation Price
                          </p>

                          <p className="mt-1 text-sm font-medium text-gray-900">
                            {formatMoney(
                              evaluation.evaluation_price
                            )}
                          </p>
                        </div>

                        <p className="mt-4 text-xs font-medium text-gray-900">
                          View Decision →
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              )}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-gray-500">
                No AI committee decisions have
                been evaluated yet.
              </p>

              <p className="mt-2 text-sm text-gray-500">
                Open an investment decision and
                record a follow-up evaluation to
                begin building the scorecard.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}