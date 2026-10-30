import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getDynamicDiscoveryUniverse } from "../dynamic-universe";
import { passesAgTradabilityGate } from "./discovery";

export const AG_OPPORTUNITY_SCAN_VERSION = "ag-opportunity-v2";

/**
 * Initialize a research-only AG v2 scan using a deterministic, explicitly
 * supplied shortlist. The shortlist must originate from a future charter-
 * aligned preselection stage, not from the v1 acceleration ADVANCE gate.
 *
 * No public route calls this helper. It does not inherit previous WATCHes,
 * create investment decisions, persist portfolio positions, or execute trades.
 */
export async function initializeAgOpportunityScan(input: { symbols: string[] }) {
  const db = await createClient();
  const { data: { user }, error: authError } = await db.auth.getUser();
  if (authError || !user) throw new Error("AG_V2_SCAN_AUTH_REQUIRED");
  if (!Array.isArray(input.symbols) || input.symbols.length < 1 || input.symbols.length > 5) {
    throw new Error("AG_V2_SCAN_INVALID_SELECTION");
  }
  const symbols = input.symbols.map(s => typeof s === "string" ? s.trim().toUpperCase() : "");
  if (symbols.some(s => !/^[A-Z][A-Z0-9.-]{0,14}$/.test(s)) ||
      new Set(symbols).size !== symbols.length) throw new Error("AG_V2_SCAN_INVALID_SELECTION");

  // Avoid overlapping versioned AG discovery scans. The eventual coordinator
  // needs an atomic DB uniqueness constraint before allowing concurrent starts.
  const { data: existing, error: existingError } = await db.from("discovery_scan_runs")
    .select("id").eq("user_id", user.id).eq("portfolio_type", "paper_active")
    .eq("scoring_version", AG_OPPORTUNITY_SCAN_VERSION)
    .in("status", ["pending", "running"]).limit(1);
  if (existingError || !existing || existing.length > 0) throw new Error("AG_V2_SCAN_ALREADY_ACTIVE_OR_UNAVAILABLE");

  const universe = await getDynamicDiscoveryUniverse();
  const bySymbol = new Map<string, number>();
  for (const stock of universe) {
    if (!passesAgTradabilityGate(stock)) continue;
    const symbol = stock.ticker.toUpperCase();
    bySymbol.set(symbol, (bySymbol.get(symbol) ?? 0) + 1);
  }
  if (symbols.some(s => bySymbol.get(s) !== 1)) throw new Error("AG_V2_SCAN_SYMBOL_NOT_ELIGIBLE");

  const { data: created, error: insertError } = await db.from("discovery_scan_runs")
    .insert({
      user_id: user.id, portfolio_type: "paper_active",
      scoring_version: AG_OPPORTUNITY_SCAN_VERSION,
      status: "running", stage: "ag_v2_ready",
      prescreen_count: symbols.length,
      state: { version: AG_OPPORTUNITY_SCAN_VERSION, symbols, cursor: 0, results: [] },
    }).select("id").single();
  if (insertError || !created) throw new Error("AG_V2_SCAN_INITIALIZATION_FAILED");
  return { scanRunId: created.id as string, selectedCount: symbols.length, version: AG_OPPORTUNITY_SCAN_VERSION };
}
