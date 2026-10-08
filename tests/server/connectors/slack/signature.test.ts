import { verifySlackSignature } from '@/src/server/connectors/slack/signature';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const SIGNING_SECRET = 'test-signing-secret';

function sign(timestamp: string, rawBody: string): string {
  return (
    'v0=' + createHmac('sha256', SIGNING_SECRET).update(`v0:${timestamp}:${rawBody}`).digest('hex')
  );
}

describe('verifySlackSignature', () => {
  it('accepts a correctly signed, fresh request', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"type":"url_verification","challenge":"abc"}';
    const signature = sign(timestamp, rawBody);

    expect(
      verifySlackSignature({ signingSecret: SIGNING_SECRET, timestamp, signature, rawBody }),
    ).toBe(true);
  });

  it('rejects a signature computed with the wrong secret', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"type":"url_verification","challenge":"abc"}';
    const signature =
      'v0=' +
      createHmac('sha256', 'wrong-secret').update(`v0:${timestamp}:${rawBody}`).digest('hex');

    expect(
      verifySlackSignature({ signingSecret: SIGNING_SECRET, timestamp, signature, rawBody }),
    ).toBe(false);
  });

  it('rejects a tampered body even with a validly-formed signature', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const signature = sign(timestamp, 'original body');

    expect(
      verifySlackSignature({
        signingSecret: SIGNING_SECRET,
        timestamp,
        signature,
        rawBody: 'tampered body',
      }),
    ).toBe(false);
  });

  it('rejects a replayed request whose timestamp is too old', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 60 * 10);
    const rawBody = '{"type":"url_verification","challenge":"abc"}';
    const signature = sign(timestamp, rawBody);

    expect(
      verifySlackSignature({ signingSecret: SIGNING_SECRET, timestamp, signature, rawBody }),
    ).toBe(false);
  });

  it('rejects when the timestamp or signature header is missing', () => {
    expect(
      verifySlackSignature({
        signingSecret: SIGNING_SECRET,
        timestamp: null,
        signature: 'v0=whatever',
        rawBody: '{}',
      }),
    ).toBe(false);
    expect(
      verifySlackSignature({
        signingSecret: SIGNING_SECRET,
        timestamp: String(Math.floor(Date.now() / 1000)),
        signature: null,
        rawBody: '{}',
      }),
    ).toBe(false);
  });
});
