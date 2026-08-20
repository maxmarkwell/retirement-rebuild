import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import DecisionForm from "@/components/decision-form";

export default async function DecisionsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: portfolios, error: portfoliosError } =
    await supabase
      .from("portfolios")
      .select("id, name")
      .order("created_at", { ascending: true });

  if (portfoliosError) {
    throw new Error(
      `Unable to load portfolios: ${portfoliosError.message}`
    );
  }

  const { data: decisions, error: decisionsError } =
    await supabase
      .from("investment_decisions")
      .select(
        "id, portfolio_id, decision_type, ticker, decision_date, decision_price, recommended_allocation, confidence_score, risk_level, expected_holding_period, thesis, source, status"
      )
      .order("decision_date", { ascending: false });

  if (decisionsError) {
    throw new Error(
      `Unable to load investment decisions: ${decisionsError.message}`
    );
  }

  const portfolioNames = new Map(
    (portfolios ?? []).map((portfolio) => [
      portfolio.id,
      portfolio.name,
    ])
  );

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-7xl">
        <div>
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Decisions
          </h1>

          <p className="mt-2 text-gray-600">
            Preserve investment reasoning before outcomes are known.
          </p>
        </div>

        <div className="mt-8">
          <DecisionForm portfolios={portfolios ?? []} />
        </div>

        <div className="mt-8 rounded-xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 p-6">
            <h2 className="text-lg font-semibold text-gray-900">
              Decision History
            </h2>

            <p className="mt-1 text-sm text-gray-500">
              Original investment decisions and theses.
            </p>
          </div>

          {decisions?.length ? (
            <div className="divide-y divide-gray-100">
              {decisions.map((decision) => (
                <div
                  key={decision.id}
                  className="p-6"
                >
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <Link
  href={`/decisions/${decision.id}`}
  className="flex flex-wrap items-center gap-3 hover:opacity-70"
>
  <span className="text-lg font-bold text-gray-900">
    {decision.ticker}
  </span>

  <span
    className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
      decision.decision_type === "buy"
        ? "bg-green-50 text-green-700"
        : decision.decision_type === "sell"
          ? "bg-red-50 text-red-700"
          : decision.decision_type === "hold"
            ? "bg-blue-50 text-blue-700"
            : decision.decision_type === "watch"
              ? "bg-yellow-50 text-yellow-700"
              : "bg-gray-100 text-gray-700"
    }`}
  >
    {decision.decision_type}
  </span>

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
</Link>

                      <p className="mt-1 text-sm text-gray-500">
                        {portfolioNames.get(
                          decision.portfolio_id
                        ) ?? "Unknown Portfolio"}
                      </p>
                    </div>

                    <div className="text-right text-sm text-gray-500">
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
                    </div>
                  </div>

                  <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                    <div>
                      <p className="text-xs uppercase text-gray-500">
                        Decision Price
                      </p>

                      <p className="mt-1 font-medium text-gray-900">
                        {decision.decision_price != null
                          ? `$${Number(
                              decision.decision_price
                            ).toFixed(2)}`
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase text-gray-500">
                        Allocation
                      </p>

                      <p className="mt-1 font-medium text-gray-900">
                        {decision.recommended_allocation != null
                          ? `$${Number(
                              decision.recommended_allocation
                            ).toFixed(2)}`
                          : "—"}
                      </p>
                    </div>

                    <div>
                      <p className="text-xs uppercase text-gray-500">
                        Confidence
                      </p>

                      <p className="mt-1 font-medium text-gray-900">
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

                      <p className="mt-1 font-medium capitalize text-gray-900">
                        {decision.risk_level ?? "—"}
                      </p>
                    </div>
                  </div>

                  <div className="mt-5">
                    <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                      Original Thesis
                    </p>

                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 text-gray-700">
                      {decision.thesis}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-6">
              <p className="text-sm text-gray-500">
                No investment decisions recorded yet.
              </p>
            </div>
          )}
        </div>
      </div>
    </main>
  );
}