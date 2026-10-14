import { renewAllDueWatches } from '@/src/server/connectors/renewal';
import { cronAuthError } from '@/src/server/http/cronAuth';
import { type NextRequest } from 'next/server';

// Re-registers Gmail watches and Graph subscriptions before they expire.
// Scheduled daily by Vercel Cron (vercel.json), which calls GET with
// `Authorization: Bearer $CRON_SECRET`. POST does the same for a manual
// run or a Supabase pg_cron+pg_net job, which must send that header too.
async function run(request: NextRequest) {
  const denied = cronAuthError(request);
  if (denied) return denied;

  const result = await renewAllDueWatches();
  return Response.json(result);
}

export const GET = run;
export const POST = run;
