import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DecisionEvaluationForm from "@/components/decision-evaluation-form";

type DecisionDetailPageProps = {
  params: Promise<{
    id: string;
  }>;
};

function formatCurrency(value: number | string | null) {
  if (value == null) {
    return "—";
  }

  return Number(value).toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatPercent(value: number | string | null) {
  if (value == null) {
    return "—";
  }

  const numericValue = Number(value);
  const prefix = numericValue > 0 ? "+" : "";

  return `${prefix}${numericValue.toFixed(2)}%`;
}

export default async function DecisionDetailPage({
  params,
}: DecisionDetailPageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // ---------------------------------------------------------
  // Load decision
  // ---------------------------------------------------------

  const { data: decision, error: decisionError } =
    await supabase
      .from("investment_decisions")
      .select(
        `
        id,
        portfolio_id,
        transaction_id,
        decision_type,
        ticker,
        decision_date,
        decision_price,
        recommended_quantity,
        recommended_allocation,
        confidence_score,
        risk_level,
        expected_holding_period,
        thesis,
        bull_case,
        bear_case,
        primary_risks,
        reassessment_conditions,
        exit_conditions,
        source,
        status,
        created_at
        `
      )
      .eq("id", id)
      .single();

  if (decisionError || !decision) {
    notFound();
  }

  // ---------------------------------------------------------
  // Load portfolio
  // ---------------------------------------------------------

  const { data: portfolio } = await supabase
    .from("portfolios")
    .select("id, name")
    .eq("id", decision.portfolio_id)
    .single();

  // ---------------------------------------------------------
  // Load linked transaction
  // ---------------------------------------------------------

  const transaction =
    decision.transaction_id
      ? (
          await supabase
            .from("transactions")
            .select(
              "id, transaction_type, ticker, quantity, price_per_share, gross_amount, fees, transaction_date"
            )
            .eq("id", decision.transaction_id)
            .single()
        ).data
      : null;

  // ---------------------------------------------------------
  // Load evaluation history
  // ---------------------------------------------------------

  const { data: evaluations, error: evaluationsError } =
    await supabase
      .from("investment_decision_evaluations")
      .select(
        `
        id,
        evaluation_date,
        evaluation_price,
        return_since_decision_pct,
        thesis_status,
        recommendation_status,
        what_was_right,
        what_was_wrong,
        new_information,
        evaluation_summary,
        source,
        created_at
        `
      )
      .eq("decision_id", decision.id)
      .order("evaluation_date", { ascending: false });

  if (evaluationsError) {
    throw new Error(
      `Unable to load decision evaluations: ${evaluationsError.message}`
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-5xl">
        <Link
          href="/decisions"
          className="text-sm font-medium text-gray-500 hover:text-gray-900"
        >
          ← Back to Decisions
        </Link>

        {/* Decision Overview */}

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500">
                {portfolio?.name ?? "Unknown Portfolio"}
              </p>

              <div className="mt-2 flex items-center gap-3">
                <h1 className="text-3xl font-bold text-gray-900">
                  {decision.ticker}
                </h1>

                <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">
                  {decision.decision_type}
                </span>
              </div>
            </div>
            <span
  className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
    decision.source === "ai_committee"
      ? "bg-purple-50 text-purple-700"
      : "bg-gray-100 text-gray-700"
  }`}
>
  {decision.source === "ai_committee"
    ? "AI Committee"
    : "Manual"}
</span>
            <div className="text-right">
              <p className="text-sm text-gray-500">
                Decision Date
              </p>

              <p className="mt-1 font-medium text-gray-900">
                {new Date(
                  decision.decision_date
                ).toLocaleString("en-US", {
                  timeZone: "America/Denver",
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
            </div>
          </div>

          <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-5">
  <div>
    <p className="text-xs uppercase text-gray-500">
      Decision Price
    </p>

    <p className="mt-1 font-semibold text-gray-900">
      {formatCurrency(decision.decision_price)}
    </p>
  </div>

  <div>
    <p className="text-xs uppercase text-gray-500">
      Suggested Initial Shares
    </p>

    <p className="mt-1 font-semibold text-gray-900">
      {decision.recommended_quantity != null
        ? Number(
            decision.recommended_quantity
          ).toLocaleString("en-US", {
            minimumFractionDigits: 0,
            maximumFractionDigits: 4,
          })
        : "—"}
    </p>
  </div>

  <div>
    <p className="text-xs uppercase text-gray-500">
      Target Allocation
    </p>

    <p className="mt-1 font-semibold text-gray-900">
      {formatCurrency(
        decision.recommended_allocation
      )}
    </p>
  </div>

  <div>
    <p className="text-xs uppercase text-gray-500">
      Confidence
    </p>

    <p className="mt-1 font-semibold text-gray-900">
      {decision.confidence_score != null
        ? `${Number(
            decision.confidence_score
          ).toFixed(0)}/100`
        : "—"}
    </p>
  </div>

  <div>
    <p className="text-xs uppercase text-gray-500">
      Risk
    </p>

    <p className="mt-1 font-semibold capitalize text-gray-900">
      {decision.risk_level ?? "—"}
    </p>
  </div>
</div>
          <div className="mt-6 grid gap-6 sm:grid-cols-2">
            <div>
              <p className="text-xs uppercase text-gray-500">
                Holding Period
              </p>

              <p className="mt-1 text-sm text-gray-900">
                {decision.expected_holding_period ?? "—"}
              </p>
            </div>

            <div>
              <p className="text-xs uppercase text-gray-500">
                Status
              </p>

              <p className="mt-1 text-sm capitalize text-gray-900">
                {decision.status}
              </p>
            </div>
          </div>
        </div>

        {/* Original Decision Reasoning */}

        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Original Thesis
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {decision.thesis}
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Primary Risks
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {decision.primary_risks ?? "Not specified."}
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Bull Case
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {decision.bull_case ?? "Not specified."}
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Bear Case
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {decision.bear_case ?? "Not specified."}
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Reassessment Conditions
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {decision.reassessment_conditions ??
                "Not specified."}
            </p>
          </section>

          <section className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900">
              Exit Conditions
            </h2>

            <p className="mt-3 whitespace-pre-wrap text-sm leading-6 text-gray-700">
              {decision.exit_conditions ?? "Not specified."}
            </p>
          </section>
        </div>

        {/* Linked Transaction */}

        <div className="mt-6 rounded-xl border border-gray-200 bg-white p-6 shadow-sm">
          <h2 className="text-lg font-semibold text-gray-900">
            Linked Transaction
          </h2>

          {transaction ? (
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <p className="text-xs uppercase text-gray-500">
                  Action
                </p>

                <p className="mt-1 font-medium uppercase text-gray-900">
                  {transaction.transaction_type}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500">
                  Quantity
                </p>

                <p className="mt-1 font-medium text-gray-900">
                  {Number(
                    transaction.quantity
                  ).toLocaleString("en-US", {
                    maximumFractionDigits: 8,
                  })}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500">
                  Price
                </p>

                <p className="mt-1 font-medium text-gray-900">
                  {formatCurrency(
                    transaction.price_per_share
                  )}
                </p>
              </div>

              <div>
                <p className="text-xs uppercase text-gray-500">
                  Gross
                </p>

                <p className="mt-1 font-medium text-gray-900">
                  {formatCurrency(
                    transaction.gross_amount
                  )}
                </p>
              </div>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gray-500">
              This decision is not linked to a transaction.
            </p>
          )}
        </div>

        {/* Evaluation Form */}

        <div className="mt-8">
          <DecisionEvaluationForm
            decisionId={decision.id}
            ticker={decision.ticker}
          />
        </div>

        {/* Evaluation History */}

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Evaluation History
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Follow-up assessments without rewriting the original decision.
            </p>
          </div>

          {evaluations?.length ? (
            <div className="divide-y divide-gray-100">
              {evaluations.map((evaluation) => (
                <div
                  key={evaluation.id}
                  className="p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <span
                        className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
                          evaluation.thesis_status ===
                          "strengthened"
                            ? "bg-green-50 text-green-700"
                            : evaluation.thesis_status ===
                                "invalidated"
                              ? "bg-red-50 text-red-700"
                              : evaluation.thesis_status ===
                                  "weakened"
                                ? "bg-yellow-50 text-yellow-700"
                                : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        Thesis {evaluation.thesis_status}
                      </span>

                      <span className="rounded bg-gray-100 px-2 py-1 text-xs font-semibold uppercase text-gray-700">
                        {evaluation.recommendation_status}
                      </span>
                    </div>

                    <div className="text-right text-sm text-gray-500">
                      {new Date(
                        evaluation.evaluation_date
                      ).toLocaleString("en-US", {
                        timeZone: "America/Denver",
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </div>
                  </div>

                  <div className="mt-5 grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs uppercase text-gray-500">
                        Evaluation Price
                      </p>

                      <p className="mt-1 font-medium text-gray-900">
                        {formatCurrency(
                          evaluation.evaluation_price
                        )}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase text-gray-500">
                        Return Since Decision
                      </p>

                      <p
                        className={`mt-1 font-medium ${
                          Number(
                            evaluation.return_since_decision_pct ??
                              0
                          ) > 0
                            ? "text-green-700"
                            : Number(
                                  evaluation.return_since_decision_pct ??
                                    0
                                ) < 0
                              ? "text-red-700"
                              : "text-gray-900"
                        }`}
                      >
                        {formatPercent(
                          evaluation.return_since_decision_pct
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Evaluation Summary
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {evaluation.evaluation_summary}
                    </p>
                  </div>

                  {evaluation.what_was_right && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        What Was Right
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {evaluation.what_was_right}
                      </p>
                    </div>
                  )}

                  {evaluation.what_was_wrong && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        What Was Wrong
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {evaluation.what_was_wrong}
                      </p>
                    </div>
                  )}

                  {evaluation.new_information && (
                    <div className="mt-5">
                      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                        New Information
                      </p>

                      <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                        {evaluation.new_information}
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-gray-500">
                No evaluations recorded yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}