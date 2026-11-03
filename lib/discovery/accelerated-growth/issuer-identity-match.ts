/** Deterministic preflight: no model calls and no network access. */
export function issuerIdentityMatches(
  researchName: string,
  researchIsin: string | null,
  vendorName: string,
  vendorIsin: string | null,
): boolean {
  const normalized = (name: string) => name.toUpperCase().replace(/[^A-Z0-9]/g, "");
  // Some dossiers append a Cayman legal-form explanation to the issuer field.
  // Only a full legal-name equality is accepted; no fuzzy or arbitrary prefix matching.
  const researchLegalName = researchName.replace(
    /,\s+an?\s+Cayman Islands exempted company\b[\s\S]*$/i, "",
  );
  const nameMatch = normalized(researchLegalName).length >= 4 &&
    normalized(researchLegalName) === normalized(vendorName);
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
