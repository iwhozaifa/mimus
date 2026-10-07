import { headers } from 'next/headers';

// Best-effort origin derived from the incoming request's own headers, so
// invite emails link back to wherever this request was actually served from
// (localhost in dev, the real deployment host in prod) without hardcoding it.
export async function getBaseUrl(): Promise<string> {
  const requestHeaders = await headers();
  const host = requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host');

  if (!host) {
    return 'http://127.0.0.1:3000';
  }

  const proto = requestHeaders.get('x-forwarded-proto') ?? 'http';
  return `${proto}://${host}`;
}
