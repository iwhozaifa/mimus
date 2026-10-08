import { createHmac, timingSafeEqual } from 'node:crypto';

// Slack's recommended tolerance -- rejects anything older, as a replay
// defense (an attacker who captured a valid signed request could resend
// the exact bytes indefinitely otherwise). See
// https://docs.slack.dev/authentication/verifying-requests-from-slack.
const MAX_CLOCK_SKEW_SECONDS = 60 * 5;

export function verifySlackSignature(params: {
  signingSecret: string;
  timestamp: string | null;
  signature: string | null;
  rawBody: string;
}): boolean {
  const { signingSecret, timestamp, signature, rawBody } = params;
  if (!timestamp || !signature) return false;

  const timestampSeconds = Number(timestamp);
  if (!Number.isFinite(timestampSeconds)) return false;
  if (Math.abs(Date.now() / 1000 - timestampSeconds) > MAX_CLOCK_SKEW_SECONDS) return false;

  const expected =
    'v0=' + createHmac('sha256', signingSecret).update(`v0:${timestamp}:${rawBody}`).digest('hex');

  const expectedBuffer = Buffer.from(expected);
  const actualBuffer = Buffer.from(signature);
  // timingSafeEqual throws on mismatched lengths rather than returning
  // false, so that case has to be handled before calling it.
  if (expectedBuffer.length !== actualBuffer.length) return false;
  return timingSafeEqual(expectedBuffer, actualBuffer);
}
