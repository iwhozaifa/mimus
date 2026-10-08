import { normalizeGraphMessage } from '@/src/server/connectors/microsoft/mail';
import { describe, expect, it } from 'vitest';
import type { Message } from '@microsoft/microsoft-graph-types';

describe('normalizeGraphMessage', () => {
  it('maps a simple text-body inbound message', () => {
    const fixture: Message = {
      id: 'msg-1',
      conversationId: 'thread-1',
      subject: 'Quick question',
      bodyPreview: 'Hey, quick question...',
      body: { contentType: 'text', content: 'Hey, quick question for you.' },
      sentDateTime: '2024-03-15T15:00:00Z',
      receivedDateTime: '2024-03-15T15:00:05Z',
      from: { emailAddress: { name: 'Jane Founder', address: 'jane@example.com' } },
      toRecipients: [{ emailAddress: { address: 'you@example.com' } }],
      ccRecipients: [{ emailAddress: { name: 'Other Person', address: 'other@example.com' } }],
    };

    const normalized = normalizeGraphMessage(fixture, 'you@example.com');

    expect(normalized.providerMessageId).toBe('msg-1');
    expect(normalized.threadId).toBe('thread-1');
    expect(normalized.subject).toBe('Quick question');
    expect(normalized.snippet).toBe('Hey, quick question...');
    expect(normalized.bodyText).toBe('Hey, quick question for you.');
    expect(normalized.direction).toBe('inbound');
    expect(normalized.sentAt).toBe('2024-03-15T15:00:00Z');
    expect(normalized.from).toEqual({ displayName: 'Jane Founder', email: 'jane@example.com' });
    expect(normalized.participants).toEqual([
      { person: { email: 'you@example.com', displayName: undefined }, role: 'to' },
      { person: { displayName: 'Other Person', email: 'other@example.com' }, role: 'cc' },
    ]);
  });

  it('marks a message sent by the account owner as outbound', () => {
    const fixture: Message = {
      id: 'msg-2',
      from: { emailAddress: { address: 'you@example.com' } },
    };
    expect(normalizeGraphMessage(fixture, 'you@example.com').direction).toBe('outbound');
  });

  it('matches the account owner address case-insensitively', () => {
    const fixture: Message = {
      id: 'msg-3',
      from: { emailAddress: { address: 'You@Example.com' } },
    };
    expect(normalizeGraphMessage(fixture, 'you@example.com').direction).toBe('outbound');
  });

  it('extracts an html body separately from a text body', () => {
    const fixture: Message = {
      id: 'msg-4',
      body: { contentType: 'html', content: '<p>HTML version</p>' },
    };
    const normalized = normalizeGraphMessage(fixture, 'you@example.com');
    expect(normalized.bodyHtml).toBe('<p>HTML version</p>');
    expect(normalized.bodyText).toBeUndefined();
  });
});
