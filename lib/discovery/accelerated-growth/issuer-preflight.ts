import "server-only";
import type { AgOpportunityDeepResearch } from "./opportunity-deep-research";
import { issuerIdentityMatches } from "./issuer-identity-match";
type Profile = { symbol?: string; companyName?: string; isin?: string; currency?: string; exchangeShortName?: string };
/** Independent-stage identity comparison against FMP's mapped company, NOT independent issuer authentication. */
export async function assertIssuerMatchesResearch(research: AgOpportunityDeepResearch) {
  if (research.promptVersion !== "ag-opportunity-deep-v2") return; // historical dossier; cannot retroactively verify
  if (!research.issuerLegalName || research.issuerLegalName.trim().length < 4) throw new Error("AG_ISSUER_RESEARCH_NAME_MISSING");
  const key = process.env.FMP_API_KEY;
  if (!key) throw new Error("AG_ISSUER_PROFILE_UNAVAILABLE");
  const url = new URL("https://financialmodelingprep.com/stable/profile");
  url.searchParams.set("symbol", research.symbol);
  url.searchParams.set("apikey", key);
  const response = await fetch(url,{cache:"no-store"});
  if (!response.ok) throw new Error("AG_ISSUER_PROFILE_UNAVAILABLE");
  const result: unknown = await response.json();
  if (!Array.isArray(result) || result.length !== 1) throw new Error("AG_ISSUER_PROFILE_AMBIGUOUS");
  const profile = result[0] as Profile;
  if (profile.symbol?.toUpperCase() !== research.symbol || !profile.companyName)
    throw new Error("AG_ISSUER_PROFILE_IDENTITY_UNVERIFIED");
  if (!issuerIdentityMatches(research.issuerLegalName, research.issuerIsin, profile.companyName, profile.isin ?? null))
    throw new Error("AG_ISSUER_RESEARCH_VENDOR_MISMATCH");
  // Same-provider data cannot certify exchange listing or a quote independently.
}
