/** Deterministic preflight: no model calls and no network access. */
export function issuerIdentityMatches(
  researchName: string,
  researchIsin: string | null,
  vendorName: string,
  vendorIsin: string | null,
): boolean {
  const normalized = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const nameMatch = normalized(researchName).length >= 4 &&
    normalized(researchName) === normalized(vendorName);
  const validIsin = (isin: string) => /^[A-Z]{2}[A-Z0-9]{10}$/.test(isin);
  const researchId = researchIsin?.trim().toUpperCase() ?? null;
  const vendorId = vendorIsin?.trim().toUpperCase() ?? null;
  // When both sides provide explicit ISINs, a contradiction vetoes a name match.
  if (researchId && vendorId) {
    if (!validIsin(researchId) || !validIsin(vendorId)) return false;
    return researchId === vendorId;
  }
  return nameMatch;
}
