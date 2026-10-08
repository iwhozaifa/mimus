import { normalizeGmailMessage } from '@/src/server/connectors/google/gmail';
import { describe, expect, it } from 'vitest';
import type { gmail_v1 } from 'googleapis';

function encode(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64url');
}

describe('normalizeGmailMessage', () => {
  it('maps a simple text/plain inbound message', () => {
    const fixture: gmail_v1.Schema$Message = {
      id: 'msg-1',
      threadId: 'thread-1',
      snippet: 'Hey, quick question...',
      internalDate: '1700000000000',
      labelIds: ['INBOX', 'UNREAD'],
      payload: {
        mimeType: 'text/plain',
        headers: [
          { name: 'From', value: 'Jane Founder <jane@example.com>' },
          { name: 'To', value: 'you@example.com' },
          { name: 'Cc', value: 'Other Person <other@example.com>' },
          { name: 'Subject', value: 'Quick question' },
        ],
        body: { data: encode('Hey, quick question for you.') },
      },
    };

    const normalized = normalizeGmailMessage(fixture);

    expect(normalized.providerMessageId).toBe('msg-1');
    expect(normalized.threadId).toBe('thread-1');
    expect(normalized.subject).toBe('Quick question');
    expect(normalized.snippet).toBe('Hey, quick question...');
    expect(normalized.bodyText).toBe('Hey, quick question for you.');
    expect(normalized.direction).toBe('inbound');
    expect(normalized.sentAt).toBe(new Date(1700000000000).toISOString());
    expect(normalized.from).toEqual({ displayName: 'Jane Founder', email: 'jane@example.com' });
    expect(normalized.participants).toEqual([
      { person: { email: 'you@example.com' }, role: 'to' },
      { person: { displayName: 'Other Person', email: 'other@example.com' }, role: 'cc' },
    ]);
  });

  it('marks a message in the SENT label as outbound', () => {
    const fixture: gmail_v1.Schema$Message = {
      id: 'msg-2',
      labelIds: ['SENT'],
      payload: { headers: [{ name: 'From', value: 'you@example.com' }] },
    };
    expect(normalizeGmailMessage(fixture).direction).toBe('outbound');
  });

  it('extracts text/plain from a multipart/alternative payload', () => {
    const fixture: gmail_v1.Schema$Message = {
      id: 'msg-3',
      labelIds: ['INBOX'],
      payload: {
        mimeType: 'multipart/alternative',
        headers: [{ name: 'From', value: 'jane@example.com' }],
        parts: [
          { mimeType: 'text/plain', body: { data: encode('Plain version') } },
          { mimeType: 'text/html', body: { data: encode('<p>HTML version</p>') } },
        ],
      },
    };

    const normalized = normalizeGmailMessage(fixture);
    expect(normalized.bodyText).toBe('Plain version');
    expect(normalized.bodyHtml).toBe('<p>HTML version</p>');
  });
});
