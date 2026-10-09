import { normalizeV2SecCompanyFacts, type V2SecCompanyFacts, type V2SecNormalizationResult } from "./v2-sec-companyfacts";

/**
 * Disabled-by-default, read-only SEC Company Facts transport.
 * No persistence, no credentials, no daily-cycle integration.
 * The SEC requires a descriptive User-Agent with contact information.
 */
export type V2SecTransportOptions = {
  enabled: boolean;
  cik: number;
  accession: string;
  fiscalPeriod: string;
  fiscalEnd: string;
  userAgent: string;
  retrievedAt: string;
  fetcher?: typeof fetch;
};

export type V2SecTransportResult =
  | { ok: true; data: V2SecNormalizationResult }
  | { ok: false; issues: string[] };

const MAX_BYTES = 12_000_000;
const TIMEOUT_MS = 12_000;

export async function retrieveV2SecCompanyFacts(options: V2SecTransportOptions): Promise<V2SecTransportResult> {
  if (!options.enabled) return { ok: false, issues: ["SEC_TRANSPORT_DISABLED"] };
  if (!Number.isInteger(options.cik) || options.cik < 1 || options.cik > 9_999_999_999 ||
      !/^\d{10}-\d{2}-\d{6}$/.test(options.accession) ||
      !/^\d{4}-Q[1-4]$/.test(options.fiscalPeriod) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(options.fiscalEnd))
    return { ok: false, issues: ["SEC_TRANSPORT_INVALID_REQUEST"] };
  if (!options.userAgent.trim() || !/\S+@\S+\.\S+/.test(options.userAgent))
    return { ok: false, issues: ["SEC_TRANSPORT_CONTACT_REQUIRED"] };
  const cik = String(options.cik).padStart(10, "0");
  if (!options.accession.startsWith(cik + "-"))
    return { ok: false, issues: ["SEC_TRANSPORT_ACCESSION_CIK_MISMATCH"] };
  const url = "https://data.sec.gov/api/xbrl/companyfacts/CIK" + cik + ".json";
  const fetcher = options.fetcher ?? fetch;
  try {
    const response = await fetcher(url, {
      method: "GET",
      headers: { "User-Agent": options.userAgent, "Accept": "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return { ok: false, issues: ["SEC_HTTP_STATUS:" + response.status] };
    if (!response.headers.get("content-type")?.toLowerCase().includes("application/json"))
      return { ok: false, issues: ["SEC_UNEXPECTED_CONTENT_TYPE"] };
    const advertised = response.headers.get("content-length");
    if (advertised && (!/^\d+$/.test(advertised) || Number(advertised) > MAX_BYTES))
      return { ok: false, issues: ["SEC_RESPONSE_TOO_LARGE"] };
    if (!response.body) return { ok: false, issues: ["SEC_EMPTY_BODY"] };
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
          return { ok: false, issues: ["SEC_RESPONSE_TOO_LARGE"] };
        }
        chunks.push(value);
      }
    } finally { reader.releaseLock(); }
    const buffer = new Uint8Array(bytes);
    let offset = 0;
    for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
    const parsed: unknown = JSON.parse(new TextDecoder().decode(buffer));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return { ok: false, issues: ["SEC_INVALID_PAYLOAD"] };
    const data = parsed as Partial<V2SecCompanyFacts>;
    if (data.cik !== options.cik || typeof data.entityName !== "string" ||
        !data.facts || typeof data.facts !== "object" || !data.facts["us-gaap"])
      return { ok: false, issues: ["SEC_CIK_OR_FACTS_MISMATCH"] };
    const normalized = normalizeV2SecCompanyFacts({
      companyfacts: data as V2SecCompanyFacts,
      accession: options.accession, fiscalPeriod: options.fiscalPeriod,
      fiscalEnd: options.fiscalEnd, retrievedAt: options.retrievedAt,
      sourceUrl: url, extractionId: "sec-companyfacts-transport-v2",
    });
    if (normalized.issues.length) return { ok: false, issues: normalized.issues };
    return { ok: true, data: normalized };
  } catch {
    return { ok: false, issues: ["SEC_FETCH_OR_PARSE_FAILED"] };
  }
}
