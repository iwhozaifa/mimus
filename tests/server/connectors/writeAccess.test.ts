import { canSendAndBook, writeScopesFor } from '@/src/server/connectors/writeScopes';
import { describe, expect, it } from 'vitest';

const GOOGLE_READ = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/calendar.readonly',
];

describe('canSendAndBook', () => {
  it('is false for a read-only connection', () => {
    expect(canSendAndBook('google', GOOGLE_READ)).toBe(false);
    expect(canSendAndBook('microsoft', ['Mail.Read', 'Calendars.Read', 'offline_access'])).toBe(
      false,
    );
    expect(canSendAndBook('google', null)).toBe(false);
  });

  it('is true only once every write scope was granted', () => {
    expect(canSendAndBook('google', [...GOOGLE_READ, ...writeScopesFor('google')])).toBe(true);
    // Google's consent screen lets the user untick a box: a partial grant
    // can't do the whole job, so it doesn't count.
    expect(
      canSendAndBook('google', [...GOOGLE_READ, 'https://www.googleapis.com/auth/gmail.send']),
    ).toBe(false);
  });

  it('matches Microsoft scopes whether or not they carry the Graph prefix', () => {
    expect(
      canSendAndBook('microsoft', [
        'https://graph.microsoft.com/Mail.Send',
        'https://graph.microsoft.com/Calendars.ReadWrite',
      ]),
    ).toBe(true);
    expect(canSendAndBook('microsoft', ['mail.send', 'calendars.readwrite'])).toBe(true);
  });

  it('never applies to providers Mimus does not send or book through', () => {
    expect(writeScopesFor('slack')).toEqual([]);
    expect(canSendAndBook('calendly', ['scheduled_events:read'])).toBe(false);
  });
});
