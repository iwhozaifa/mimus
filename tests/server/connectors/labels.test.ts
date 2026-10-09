import { connectionLabel } from '@/src/server/connectors/labels';
import { describe, expect, it } from 'vitest';

describe('connectionLabel', () => {
  it.each([
    ['google', 'email', 'Google Gmail'],
    ['google', 'calendar', 'Google Calendar'],
    ['microsoft', 'email', 'Outlook Mail'],
    ['microsoft', 'calendar', 'Outlook Calendar'],
    ['slack', 'slack', 'Slack'],
    ['calendly', 'scheduling', 'Calendly'],
  ] as const)('labels %s/%s as %s', (provider, accountType, label) => {
    expect(connectionLabel(provider, accountType)).toBe(label);
  });
});
