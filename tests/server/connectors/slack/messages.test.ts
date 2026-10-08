import { normalizeSlackMessage } from '@/src/server/connectors/slack/messages';
import { describe, expect, it } from 'vitest';

describe('normalizeSlackMessage', () => {
  it('normalizes a plain channel message as inbound, scoped to channel+ts', () => {
    const normalized = normalizeSlackMessage('C123', {
      ts: '1700000000.000100',
      text: 'Standup notes for today',
      user: 'U456',
    });

    expect(normalized).toMatchObject({
      providerMessageId: 'C123:1700000000.000100',
      threadId: undefined,
      bodyText: 'Standup notes for today',
      snippet: 'Standup notes for today',
      direction: 'inbound',
      from: { externalPersonId: 'U456' },
    });
    expect(normalized.sentAt).toBe(new Date(1700000000000).toISOString());
  });

  it('uses thread_ts as the thread id for a threaded reply', () => {
    const normalized = normalizeSlackMessage('C123', {
      ts: '1700000001.000200',
      thread_ts: '1700000000.000100',
      text: 'Reply in thread',
      user: 'U456',
    });

    expect(normalized.threadId).toBe('1700000000.000100');
  });

  it('truncates a long message to a short snippet', () => {
    const longText = 'x'.repeat(300);
    const normalized = normalizeSlackMessage('C123', {
      ts: '1700000000.000100',
      text: longText,
      user: 'U456',
    });

    expect(normalized.snippet!.length).toBeLessThanOrEqual(200);
    expect(normalized.bodyText).toBe(longText);
  });

  it('has no from person when the message has no user (e.g. a bot/app message)', () => {
    const normalized = normalizeSlackMessage('C123', {
      ts: '1700000000.000100',
      text: 'Deploy finished',
      bot_id: 'B789',
    });

    expect(normalized.from).toBeUndefined();
  });
});
