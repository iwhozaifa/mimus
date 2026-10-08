import { verifyCalendlySignature } from '@/src/server/connectors/calendly/signature';
import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';

const SIGNING_KEY = 'test-signing-key';

function sign(timestamp: string, rawBody: string): string {
  const digest = createHmac('sha256', SIGNING_KEY).update(`${timestamp}.${rawBody}`).digest('hex');
  return `t=${timestamp},v1=${digest}`;
}

describe('verifyCalendlySignature', () => {
  it('accepts a correctly signed, fresh request', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"event":"invitee.created"}';
    const header = sign(timestamp, rawBody);

    expect(verifyCalendlySignature({ signingKey: SIGNING_KEY, header, rawBody })).toBe(true);
  });

  it('rejects a signature computed with the wrong signing key', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const rawBody = '{"event":"invitee.created"}';
    const digest = createHmac('sha256', 'wrong-key')
      .update(`${timestamp}.${rawBody}`)
      .digest('hex');
    const header = `t=${timestamp},v1=${digest}`;

    expect(verifyCalendlySignature({ signingKey: SIGNING_KEY, header, rawBody })).toBe(false);
  });

  it('rejects a tampered body', () => {
    const timestamp = String(Math.floor(Date.now() / 1000));
    const header = sign(timestamp, 'original body');

    expect(
      verifyCalendlySignature({ signingKey: SIGNING_KEY, header, rawBody: 'tampered body' }),
    ).toBe(false);
  });

  it('rejects a replayed request whose timestamp is too old', () => {
    const timestamp = String(Math.floor(Date.now() / 1000) - 60 * 10);
    const rawBody = '{"event":"invitee.created"}';
    const header = sign(timestamp, rawBody);

    expect(verifyCalendlySignature({ signingKey: SIGNING_KEY, header, rawBody })).toBe(false);
  });

  it('rejects a missing or malformed header', () => {
    expect(verifyCalendlySignature({ signingKey: SIGNING_KEY, header: null, rawBody: '{}' })).toBe(
      false,
    );
    expect(
      verifyCalendlySignature({
        signingKey: SIGNING_KEY,
        header: 'not-a-real-header',
        rawBody: '{}',
      }),
    ).toBe(false);
  });
});
