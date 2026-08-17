import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export default async function Home() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: portfolios, error } = await supabase
    .from("portfolios")
    .select("*")
    .order("created_at", { ascending: true });

  if (error) {
    throw new Error(`Unable to load portfolios: ${error.message}`);
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="mx-auto max-w-6xl">
        <div className="mb-8">
          <p className="text-sm font-medium text-gray-500">
            RETIREMENT REBUILD
          </p>

          <h1 className="mt-1 text-3xl font-bold text-gray-900">
            Portfolio Dashboard
          </h1>

          <p className="mt-2 text-gray-600">
            Build permanent capital. Measure what works.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
          {portfolios?.map((portfolio) => (
            <div
              key={portfolio.id}
              className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
            >
              <p className="text-sm text-gray-500">
                {portfolio.type}
              </p>

              <h2 className="mt-1 text-lg font-semibold text-gray-900">
                {portfolio.name}
              </h2>

              <p className="mt-6 text-3xl font-bold text-gray-900">
                ${Number(portfolio.starting_capital).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </p>

              <p className="mt-1 text-sm text-gray-500">
                Starting Capital
              </p>

              <div className="mt-6 border-t border-gray-100 pt-4">
                <span className="text-sm text-gray-600">
                  {portfolio.is_real_money
                    ? "Real Money"
                    : "Virtual Portfolio"}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}