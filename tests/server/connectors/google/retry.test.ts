import {
  isGoogleRateLimitError,
  withGoogleRateLimitRetry,
} from '@/src/server/connectors/google/retry';
import { describe, expect, it, vi } from 'vitest';

// Shaped like the GaxiosError googleapis throws for Gmail's per-user quota
// ("Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per
// minute per user'") -- a 403, not a 429, which gaxios's own retry skips.
function quotaError(status = 403, reason = 'rateLimitExceeded') {
  return Object.assign(
    new Error(
      "Quota exceeded for quota metric 'Total Query Cost' and limit 'Units per minute per user'",
    ),
    { status, response: { status, data: { error: { errors: [{ reason }] } } } },
  );
}

describe('isGoogleRateLimitError', () => {
  it('matches 429s and 403 quota/rate-limit errors', () => {
    expect(isGoogleRateLimitError(quotaError(429))).toBe(true);
    expect(isGoogleRateLimitError(quotaError(403, 'rateLimitExceeded'))).toBe(true);
    expect(isGoogleRateLimitError(quotaError(403, 'userRateLimitExceeded'))).toBe(true);
  });

  it('does not match a genuine 403 permission error', () => {
    const forbidden = Object.assign(new Error('Insufficient Permission'), {
      status: 403,
      response: {
        status: 403,
        data: { error: { errors: [{ reason: 'insufficientPermissions' }] } },
      },
    });
    expect(isGoogleRateLimitError(forbidden)).toBe(false);
    expect(isGoogleRateLimitError(new Error('boom'))).toBe(false);
  });
});

describe('withGoogleRateLimitRetry', () => {
  it('retries a rate-limited call with exponential backoff until it succeeds', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const call = vi
      .fn()
      .mockRejectedValueOnce(quotaError())
      .mockRejectedValueOnce(quotaError(429))
      .mockResolvedValueOnce('ok');

    await expect(withGoogleRateLimitRetry(call, { sleep, random: () => 0 })).resolves.toBe('ok');
    expect(call).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map(([ms]) => ms)).toEqual([1000, 2000]);
  });

  it('rethrows non-rate-limit errors immediately without retrying', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const call = vi.fn().mockRejectedValue(new Error('boom'));

    await expect(withGoogleRateLimitRetry(call, { sleep })).rejects.toThrow('boom');
    expect(call).toHaveBeenCalledTimes(1);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('gives up after maxAttempts and rethrows the last rate-limit error', async () => {
    const sleep = vi.fn<(ms: number) => Promise<void>>(async () => {});
    const call = vi.fn().mockRejectedValue(quotaError());

    await expect(withGoogleRateLimitRetry(call, { sleep, maxAttempts: 3 })).rejects.toThrow(
      'Quota exceeded',
    );
    expect(call).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });
});
