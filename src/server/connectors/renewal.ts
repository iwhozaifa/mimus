// The one place the renewal cron route reaches into provider internals --
// kept at the connectors root (not inside a provider subfolder) for the
// same reason bootstrap.ts/cookies.ts are: app/** code is blocked by the
// eslint import-boundary rule from reaching into connectors/<provider>/**
// directly, so this file does it on the route's behalf.
import { renewGmailWatchesIfNeeded } from '@/src/server/connectors/google/webhook';
import { renewGraphSubscriptionsIfNeeded } from '@/src/server/connectors/microsoft/webhook';

export async function renewAllDueWatches() {
  const [google, microsoft] = await Promise.all([
    renewGmailWatchesIfNeeded(),
    renewGraphSubscriptionsIfNeeded(),
  ]);
  return { google, microsoft };
}
