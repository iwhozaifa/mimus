import type { Provider } from '@/src/server/connectors/types';

// The permissions Mimus needs to send scheduling replies and book meetings.
// They are never part of a normal connect -- the user grants them
// separately, with "Allow sending and booking" on the Connections page.
const WRITE_SCOPES: Partial<Record<Provider, string[]>> = {
  google: [
    'https://www.googleapis.com/auth/gmail.send',
    'https://www.googleapis.com/auth/calendar.events',
  ],
  microsoft: ['Mail.Send', 'Calendars.ReadWrite'],
};

export function writeScopesFor(provider: Provider): string[] {
  return WRITE_SCOPES[provider] ?? [];
}

// Microsoft reports Graph scopes either bare ("Mail.Send") or with the
// resource prefix, in any case; Google's are full URLs.
function normalize(provider: Provider, scope: string): string {
  return provider === 'microsoft' ? scope.split('/').pop()!.toLowerCase() : scope;
}

// True only when every write scope was granted: Google's consent screen
// lets a user untick one, and half the permissions can't do the job.
export function canSendAndBook(provider: Provider, scopes: string[] | null): boolean {
  const needed = writeScopesFor(provider);
  if (!needed.length || !scopes) return false;
  const granted = new Set(scopes.map((scope) => normalize(provider, scope)));
  return needed.every((scope) => granted.has(normalize(provider, scope)));
}
