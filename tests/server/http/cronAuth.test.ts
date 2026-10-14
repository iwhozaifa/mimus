import { cronAuthError } from '@/src/server/http/cronAuth';
import { afterEach, describe, expect, it, vi } from 'vitest';

function request(authorization?: string) {
  return new Request('http://127.0.0.1:3000/api/cron/test', {
    headers: authorization ? { authorization } : {},
  });
}

describe('cronAuthError', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('refuses every call when CRON_SECRET is not configured', () => {
    vi.stubEnv('CRON_SECRET', '');
    expect(cronAuthError(request('Bearer '))?.status).toBe(500);
  });

  it('refuses a missing or wrong bearer token', () => {
    vi.stubEnv('CRON_SECRET', 'right-secret');
    expect(cronAuthError(request())?.status).toBe(401);
    expect(cronAuthError(request('Bearer wrong-secret'))?.status).toBe(401);
  });

  it('lets the scheduler through with the right bearer token', () => {
    vi.stubEnv('CRON_SECRET', 'right-secret');
    expect(cronAuthError(request('Bearer right-secret'))).toBeNull();
  });
});
