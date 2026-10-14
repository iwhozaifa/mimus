// Restarts first imports that were cut off. The import runs in after() on
// the connect callback, and a serverless function stops at its
// maxDuration (300s on Vercel Hobby) -- a busy 90-day Gmail inbox takes
// longer than that. Every provider's backfill is resumable (it skips what
// it already stored and only sets backfill_completed_at once it finishes),
// so running it again picks up where it stopped. Kept at the connectors
// root, like renewal.ts, so the cron route can import it.
import { createServiceClient } from '@/src/db/service';
import { getConnector } from '@/src/server/connectors/bootstrap';
import type { Provider } from '@/src/server/connectors/types';

// An import younger than this may still be running in its own after().
const GRACE_PERIOD_MS = 10 * 60 * 1000;

export async function resumeUnfinishedBackfills({
  limit = 3,
  now = new Date(),
}: { limit?: number; now?: Date } = {}): Promise<{ resumed: string[]; failed: string[] }> {
  const { data } = await createServiceClient()
    .from('connected_accounts')
    .select('id, provider')
    .eq('status', 'connected')
    .is('backfill_completed_at', null)
    .lt('created_at', new Date(now.getTime() - GRACE_PERIOD_MS).toISOString())
    .order('created_at', { ascending: true })
    .limit(limit)
    .throwOnError();

  const resumed: string[] = [];
  const failed: string[] = [];
  // One at a time: each import paces itself against its provider's
  // per-user quota, and running them together would share one function's
  // time limit anyway.
  for (const account of data ?? []) {
    try {
      await getConnector(account.provider as Provider).backfill(account.id);
      resumed.push(account.id);
    } catch (err) {
      console.error(`Resuming the import for account ${account.id} failed`, err);
      failed.push(account.id);
    }
  }
  return { resumed, failed };
}
