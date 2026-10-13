export type ValuationAuditInputs = {
  vendorMarketCap: number | null;
  vendorEnterpriseValue: number | null;
  secMarketCap: number | null;
  secEnterpriseValue: number | null;
  vendorPriceToSales?: number | null;
  vendorPriceToEarnings?: number | null;
  vendorEvToSales?: number | null;
  secPriceToSales?: number | null;
  secPriceToEarnings?: number | null;
  secEvToSales?: number | null;
};

export function auditValuationNarrative(text: string, values: ValuationAuditInputs | null) {
  const findings: string[] = [];
  let checked = 0;
  const claimsChecked: Array<{ basis: string; metric: string; stated: number; expected: number; deviationPct: number; passed: boolean }> = [];
  if (!values || !text) return { version: "ag-narrative-audit-v3", status: "NOT_EVALUATED", checked, claimsChecked, findings: ["Missing narrative or valuation inputs"] };
  // Anchor each claim to its metric; stop at punctuation, conjunctions and the next metric.
  // A basis applies only when explicit in the current sentence or inherited from a
  // single-basis sentence. Mixed-basis sentences without local attribution are skipped.
  const sentences = text.split(/(?<=[.!?])\s+|\n+/);
  for (const sentence of sentences) {
    const basisMatches = [...sentence.matchAll(/\b(?:FMP|vendor|SEC(?:[- ](?:share|derived|based|diagnostic))?)\b/gi)];
    const hasVendor = basisMatches.some(m => /fmp|vendor/i.test(m[0]));
    const hasSec = basisMatches.some(m => /^sec/i.test(m[0]));
    const claims = [...sentence.matchAll(/\b(market\s+cap(?:italization)?|enterprise\s+value)\b(?:\s+(?:is|was|of|at|equals|approximately|about))?\s*[:=]?\s*\$\s*([\d,]+(?:\.\d+)?)\s*(trillion|billion|million)\b/gi)];
    for (const match of claims) {
      const prefix = sentence.slice(0, match.index ?? 0);
      const localBases = [...prefix.matchAll(/\b(?:FMP|vendor|SEC(?:[- ](?:share|derived|based|diagnostic))?)\b/gi)];
      const closest = localBases.at(-1)?.[0] ?? null;
      const basis = hasVendor && !hasSec ? "vendor" : hasSec && !hasVendor ? "sec" :
        closest && /fmp|vendor/i.test(closest) ? "vendor" :
        closest && /^sec/i.test(closest) ? "sec" : null;
      if (!basis) continue;
      const isEv = /enterprise/i.test(match[1]);
      const expected = basis === "vendor"
        ? isEv ? values.vendorEnterpriseValue : values.vendorMarketCap
        : isEv ? values.secEnterpriseValue : values.secMarketCap;
      if (expected == null || expected <= 0) continue;
      const unit = match[3].toLowerCase();
      const actual = Number(match[2].replace(/,/g, "")) * (unit === "trillion" ? 1e12 : unit === "billion" ? 1e9 : 1e6);
      checked++;
      const deviation = Math.abs(actual - expected) / expected;
      claimsChecked.push({ basis, metric: isEv ? "enterpriseValue" : "marketCap", stated: actual, expected, deviationPct: deviation * 100, passed: Number.isFinite(actual) && deviation <= 0.05 });
      if (!Number.isFinite(actual) || deviation > 0.05)
        findings.push(`${basis} ${isEv ? "enterprise value" : "market capitalization"}: ${match[0]} differs from snapshot by ${Number.isFinite(deviation) ? (deviation * 100).toFixed(1) + "%" : "a nonfinite amount"}.`);
    }
  }
  return { version: "ag-narrative-audit-v2", status: findings.length ? "FLAGGED" : checked ? "PASS" : "NOT_EVALUATED", checked, findings };
}
