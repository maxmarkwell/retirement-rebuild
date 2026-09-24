export type AgResearchStage = "CATALYST" | "DEEP_RESEARCH" | "COMMITTEE" | "HOLDING_REVIEW";

const MAX_ATTEMPTS = 2;
const BASE_BACKOFF_MS = 750;

export class AgResearchOutputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AgResearchOutputError";
  }
}

function errorText(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function statusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" ? value : null;
}

export function isRetryableAgResearchError(error: unknown): boolean {
  if (error instanceof AgResearchOutputError) return true;

  const status = statusCode(error);
  if (status === 404 || status === 408 || status === 409 || status === 429 || (status !== null && status >= 500)) {
    return true;
  }

  const message = errorText(error);
  return /\b404\b|\b408\b|\b409\b|\b429\b|rate.?limit|timeout|timed out|connection|ECONNRESET|ETIMEDOUT|server error|invalid json/i.test(message);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function withAgResearchRetry<T>(
  stage: AgResearchStage,
  symbol: string,
  operation: (attempt: number) => Promise<T>
): Promise<T> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (!isRetryableAgResearchError(error) || attempt === MAX_ATTEMPTS) break;
      await sleep(BASE_BACKOFF_MS * attempt);
    }
  }

  const message = errorText(lastError);
  throw new Error(`${stage} failed for ${symbol} after ${MAX_ATTEMPTS} bounded attempts: ${message}`);
}
