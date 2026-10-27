/**
 * Pure validation contract for FUTURE single-entry shared contributions.
 * Does not persist deposits, modify brokerage cash, or enable purchases.
 * Idempotency is enforced only once backed by a DB uniqueness constraint
 * and atomic write; this helper intentionally does not claim to enforce it.
 */
export type ContributionPortfolio = {
  id: string;
  type: string;
  isRealMoney: boolean;
};
export type SharedContributionRequest = {
  amount: number;
  contributionDate: string;
  idempotencyKey: string;
};
export function planSharedContribution(
  portfolios: ContributionPortfolio[],
  request: SharedContributionRequest,
) {
  const real = portfolios.filter(p => p.type === "real" && p.isRealMoney);
  if (real.length !== 1 || !real[0].id) throw new Error("Exactly one real-money account is required.");
  // JSON numbers such as 0.29 may not multiply to an exact integer in
  // binary floating point. Normalize to cents, then reject sub-cent amounts.
  const rawCents = request.amount * 100;
  const contributionCents = Math.round(rawCents);
  if (!Number.isFinite(request.amount) || request.amount <= 0 ||
      !Number.isSafeInteger(contributionCents) ||
      Math.abs(rawCents - contributionCents) > 1e-8) {
    throw new Error("Contribution must be a positive whole-cent amount.");
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(request.contributionDate) ||
      (!Number.isFinite(Date.parse(request.contributionDate + "T00:00:00Z")) || new Date(request.contributionDate + "T00:00:00Z").toISOString().slice(0, 10) !== request.contributionDate)) {
    throw new Error("Contribution date must be a valid ISO calendar date.");
  }
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(request.idempotencyKey)) {
    throw new Error("A valid unique contribution request key is required.");
  }
  return {
    destinationPortfolioId: real[0].id,
    contributionCents,
    contributionDate: request.contributionDate,
    idempotencyKey: request.idempotencyKey,
    postingMode: "not_implemented" as const,
    ledgerEntriesPlanned: 1 as const,
    fundsTransferred: false as const,
  };
}
