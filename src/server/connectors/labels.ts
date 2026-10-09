import type { AccountType, Provider } from '@/src/server/connectors/types';

// One OAuth grant can produce several connected_accounts rows (Google and
// Microsoft each create an email row and a calendar row), so the UI names
// each row by what it actually reads rather than by provider alone.
const LABELS: Record<Provider, Partial<Record<AccountType, string>>> = {
  google: { email: 'Google Gmail', calendar: 'Google Calendar' },
  microsoft: { email: 'Outlook Mail', calendar: 'Outlook Calendar' },
  slack: { slack: 'Slack' },
  calendly: { scheduling: 'Calendly' },
};

export function connectionLabel(provider: Provider, accountType: AccountType): string {
  return LABELS[provider][accountType] ?? provider;
}
