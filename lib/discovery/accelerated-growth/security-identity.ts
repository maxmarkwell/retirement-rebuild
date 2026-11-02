/** Security identity diagnostics, not an independent exchange/ISIN verification. */
export type SecurityIdentity = {
  status: "CONSISTENT_VENDOR" | "MISMATCH" | "UNVERIFIED";
  requestedSymbol: string;
  profileSymbol: string | null;
  quoteSymbol: string | null;
  profileExchange: string | null;
  quoteExchange: string | null;
  profileCurrency: string | null;
  quoteCurrency: string | null;
  profileIsin: string | null;
  quoteIsin: string | null;
  limitations: string[];
};
type IdentityRow = {symbol?: string; exchangeShortName?: string; exchange?: string; currency?: string; isin?: string};
const norm = (x: unknown) => typeof x === "string" && x.trim() ? x.trim().toUpperCase() : null;
/** Never equate an FMP vendor self-match with independently verified issuer identity. */
export function assessSecurityIdentity(symbol: string, profile: IdentityRow | null, quote: IdentityRow | null): SecurityIdentity {
  const requested = norm(symbol) ?? "";
  const ps = norm(profile?.symbol), qs = norm(quote?.symbol);
  const pe = norm(profile?.exchangeShortName ?? profile?.exchange);
  const qe = norm(quote?.exchangeShortName ?? quote?.exchange);
  const pc = norm(profile?.currency), qc = norm(quote?.currency);
  const pi = norm(profile?.isin), qi = norm(quote?.isin);
  const issues: string[] = [];
  if (!ps || !qs) issues.push("Profile or quote symbol is missing; requested security identity cannot be confirmed.");
  if (ps && ps !== requested) issues.push("Profile symbol does not match requested symbol.");
  if (qs && qs !== requested) issues.push("Quote symbol does not match requested symbol.");
  if (pe && qe && pe !== qe) issues.push("Profile and quote exchange differ.");
  if (pc && qc && pc !== qc) issues.push("Profile and quote currency differ.");
  if (pi && qi && pi !== qi) issues.push("Profile and quote ISIN differ.");
  const mismatch = issues.some(x => x.includes("does not match") || x.includes("differ"));
  if (!pe || !qe) issues.push("Exchange is missing from at least one vendor record.");
  if (!pc || !qc) issues.push("Currency is missing from at least one vendor record.");
  if (!pi || !qi) issues.push("ISIN is missing from at least one vendor record; issuer not independently checked.");
  if (!mismatch) issues.push("Same-provider consistency is NOT independent exchange, issuer, or share-count verification.");
  return { status: mismatch ? "MISMATCH" : issues.length > 1 ? "UNVERIFIED" : "CONSISTENT_VENDOR",
    requestedSymbol: requested, profileSymbol: ps, quoteSymbol: qs,
    profileExchange: pe, quoteExchange: qe, profileCurrency: pc, quoteCurrency: qc,
    profileIsin: pi, quoteIsin: qi, limitations: issues };
}
