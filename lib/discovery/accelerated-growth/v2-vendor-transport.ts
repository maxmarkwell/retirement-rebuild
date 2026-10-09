import { normalizeV2VendorQuarters, type V2VendorQuarter, type V2QuarterlyNormalizationResult } from "./v2-vendor-normalizer";

/** Disabled-by-default, read-only vendor transport. No credentials or persistence. */
export type V2VendorTransportOptions = {
  enabled: boolean;
  issuerId: string;
  incomeUrl: string;
  cashFlowUrl: string;
  publishedAt: string;
  retrievedAt: string;
  documentId: string;
  extractionId: string;
  publisher: string;
  fetcher?: typeof fetch;
};
export type V2VendorTransportResult =
  | { ok: true; data: V2QuarterlyNormalizationResult }
  | { ok: false; issues: string[] };
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 12_000;
function allowedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "financialmodelingprep.com" &&
      !url.username && !url.password && !url.hash &&
      !url.searchParams.has("apikey") && !url.searchParams.has("api_key") &&
      !url.searchParams.has("token") && !url.searchParams.has("key");
  } catch { return false; }
}
async function readQuarters(fetcher: typeof fetch, url: string): Promise<V2VendorQuarter[]> {
  const response = await fetcher(url, {
    method: "GET", redirect: "error", cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!response.ok) throw Error("VENDOR_HTTP_STATUS:" + response.status);
  if (!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
    throw Error("VENDOR_UNEXPECTED_CONTENT_TYPE");
  const length = response.headers.get("content-length");
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_BYTES))
    throw Error("VENDOR_RESPONSE_TOO_LARGE");
  if (!response.body) throw Error("VENDOR_EMPTY_BODY");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_BYTES) {
        await reader.cancel();
        throw Error("VENDOR_RESPONSE_TOO_LARGE");
      }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(bytes);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
  if (!Array.isArray(parsed) || parsed.length === 0 || parsed.length > 100 ||
      parsed.some(x => !x || typeof x !== "object" || Array.isArray(x)))
    throw Error("VENDOR_INVALID_PAYLOAD");
  return parsed as V2VendorQuarter[];
}
export async function retrieveV2VendorQuarters(options: V2VendorTransportOptions): Promise<V2VendorTransportResult> {
  if (!options.enabled) return { ok: false, issues: ["VENDOR_TRANSPORT_DISABLED"] };
  if (!allowedUrl(options.incomeUrl) || !allowedUrl(options.cashFlowUrl) ||
      options.incomeUrl === options.cashFlowUrl)
    return { ok: false, issues: ["VENDOR_TRANSPORT_INVALID_URL"] };
  const fetcher = options.fetcher ?? fetch;
  try {
    const [income, cashFlow] = await Promise.all([
      readQuarters(fetcher, options.incomeUrl),
      readQuarters(fetcher, options.cashFlowUrl),
    ]);
    // The provider must explicitly declare USD on each row. We do not infer currency.
    // Provider monetary scale is not authenticated by these payloads, so do not
    // fabricate a scale declaration or emit normalized observations.
    if (income.some(row => row.reportedCurrency !== "USD") ||
        cashFlow.some(row => row.reportedCurrency !== "USD"))
      return { ok: false, issues: ["VENDOR_TRANSPORT_CURRENCY_UNVERIFIED"] };
    return { ok: false, issues: ["VENDOR_TRANSPORT_SCALE_UNVERIFIED"] };
  } catch (error) {
    const issue = error instanceof Error && error.message.startsWith("VENDOR_")
      ? error.message : "VENDOR_TRANSPORT_FETCH_OR_PARSE_FAILED";
    return { ok: false, issues: [issue] };
  }
}
