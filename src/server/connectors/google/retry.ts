import { sleep as defaultSleep } from '@/src/lib/sleep';

// Gmail enforces a per-user "units per minute" quota and reports hitting it
// as a 403 (reason rateLimitExceeded/userRateLimitExceeded), not a 429 --
// and gaxios's built-in retry only covers 429/5xx, so without this a long
// backfill dies partway through on its first quota hit. Google's documented
// remedy is exponential backoff with jitter.
const RATE_LIMIT_REASONS = new Set(['rateLimitExceeded', 'userRateLimitExceeded']);

interface GoogleApiError {
  status?: number;
  response?: { status?: number; data?: { error?: { errors?: { reason?: string }[] } } };
}

export function isGoogleRateLimitError(err: unknown): boolean {
  if (typeof err !== 'object' || err === null) return false;
  const { status, response } = err as GoogleApiError;
  const httpStatus = status ?? response?.status;
  if (httpStatus === 429) return true;
  if (httpStatus !== 403) return false;
  const reasons = response?.data?.error?.errors?.map((e) => e.reason) ?? [];
  return reasons.some((reason) => reason !== undefined && RATE_LIMIT_REASONS.has(reason));
}

export interface RetryOptions {
  maxAttempts?: number;
  sleep?: (ms: number) => Promise<void>;
  random?: () => number;
}

// 1s, 2s, 4s ... capped at 64s, plus up to 1s of jitter. Eight attempts
// waits ~2 minutes in total -- enough to roll past a per-minute quota window.
const BASE_DELAY_MS = 1000;
const MAX_DELAY_MS = 64_000;

export async function withGoogleRateLimitRetry<T>(
  call: () => Promise<T>,
  { maxAttempts = 8, sleep = defaultSleep, random = Math.random }: RetryOptions = {},
): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (attempt >= maxAttempts || !isGoogleRateLimitError(err)) throw err;
      const backoff = Math.min(BASE_DELAY_MS * 2 ** (attempt - 1), MAX_DELAY_MS);
      await sleep(backoff + Math.floor(random() * 1000));
    }
  }
}
