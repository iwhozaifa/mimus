import { createHmac, timingSafeEqual } from 'node:crypto';

// Same replay-defense rationale as Slack's signature.ts -- rejects
// anything older, so a captured valid signed request can't be resent
// indefinitely.
const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

// Calendly's header shape: "t=<unix-seconds>,v1=<hex-hmac>". See
// https://developer.calendly.com/api-docs/overview/webhooks/webhook-signatures.
function parseHeader(header: string): { timestamp: string; signature: string } | null {
  const parts = Object.fromEntries(
    header
      .split(',')
      .map((part) => part.split('=', 2))
      .filter((pair): pair is [string, string] => pair.length === 2),
  );
  if (!parts.t || !parts.v1) return null;
  return { timestamp: parts.t, signature: parts.v1 };
}

export function verifyCalendlySignature(params: {
  signingKey: string;
  header: string | null;
  rawBody: string;
}): boolean {
  const { signingKey, header, rawBody } = params;
  if (!header) return false;

  const parsed = parseHeader(header);
  if (!parsed) return false;
  const { timestamp, signature } = parsed;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected = createHmac('sha256', signingKey).update(`${timestamp}.${rawBody}`).digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
