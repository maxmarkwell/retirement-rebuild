// Reuse the same CRON_SECRET-protected, budget-limited quote refresh.
// This is a second scheduled opportunity for provider-missing symbols,
// not a new quote provider or a write to portfolio accounting.
export { GET } from "../prewarm/route";
