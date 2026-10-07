export type AgBulkGrowthSignal = {
  symbol: string;
  date: string;
  revenueGrowthPct: number | null;
  operatingIncomeGrowthPct: number | null;
  netIncomeGrowthPct: number | null;
};

type RawGrowthRow = Record<string, unknown>;

function finitePct(value: unknown): number | null {
  const number = typeof value === "number" ? value : Number(value);
  return Number.isFinite(number) ? number * 100 : null;
}

function parseCsv(text: string): RawGrowthRow[] {
  const rows: string[][] = [];
  let row: string[] = [], field = "", quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') { field += '"'; index += 1; }
      else quoted = !quoted;
    } else if (char === "," && !quoted) { row.push(field); field = ""; }
    else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index += 1;
      row.push(field); field = "";
      if (row.some((value) => value.length > 0)) rows.push(row);
      row = [];
    } else field += char;
  }
  if (field.length > 0 || row.length > 0) { row.push(field); rows.push(row); }
  const [headers, ...data] = rows;
  if (!headers) return [];
  return data.map((values) => Object.fromEntries(headers.map((header, index) => [header.trim(), values[index] ?? ""])));
}

function parseRows(text: string): RawGrowthRow[] {
  const trimmed = text.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : [];
  }
  return parseCsv(trimmed);
}

function normalize(row: RawGrowthRow): AgBulkGrowthSignal | null {
  const symbol = typeof row.symbol === "string" ? row.symbol.trim().toUpperCase() : "";
  const date = typeof row.date === "string" ? row.date : "";
  if (!symbol || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return {
    symbol,
    date,
    revenueGrowthPct: finitePct(row.growthRevenue),
    operatingIncomeGrowthPct: finitePct(row.growthOperatingIncome),
    netIncomeGrowthPct: finitePct(row.growthNetIncome),
  };
}

async function fetchPeriod(year: number, period: "Q1"|"Q2"|"Q3"|"Q4") {
  const apiKey = process.env.FMP_API_KEY;
  if (!apiKey) throw new Error("FMP_API_KEY is not configured.");
  const url = new URL("https://financialmodelingprep.com/stable/income-statement-growth-bulk");
  url.searchParams.set("year", String(year));
  url.searchParams.set("period", period);
  url.searchParams.set("apikey", apiKey);
  const response = await fetch(url, { next: { revalidate: 21600 } });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`FMP bulk income growth failed for ${year} ${period} with status ${response.status}: ${text.slice(0,250)}`);
  }
  return parseRows(await response.text()).map(normalize).filter((row): row is AgBulkGrowthSignal => row != null);
}

export async function getAgBulkGrowthSignals(symbols: string[], now = new Date()): Promise<Map<string,AgBulkGrowthSignal>> {
  const wanted = new Set(symbols.map((symbol) => symbol.trim().toUpperCase()).filter(Boolean));
  if (wanted.size === 0) return new Map();
  const year = now.getUTCFullYear();
  // Four bulk calls replace hundreds of per-symbol selector calls. Choosing the
  // latest filed date handles different fiscal calendars without guessing which
  // fiscal quarter is current for each company.
  const periods = await Promise.all((["Q1","Q2","Q3","Q4"] as const).map((period) => fetchPeriod(year, period)));
  const latest = new Map<string,AgBulkGrowthSignal>();
  for (const row of periods.flat()) {
    if (!wanted.has(row.symbol)) continue;
    const existing = latest.get(row.symbol);
    if (!existing || row.date > existing.date) latest.set(row.symbol, row);
  }
  return latest;
}
