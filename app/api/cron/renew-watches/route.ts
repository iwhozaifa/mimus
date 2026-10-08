import { renewAllDueWatches } from '@/src/server/connectors/renewal';
import { type NextRequest } from 'next/server';

// Invoked on a schedule once one exists -- Vercel Cron (vercel.json) or
// Supabase's pg_cron+pg_net calling this URL both work, but either needs
// a deployed HTTPS URL to point at, which doesn't exist yet (see README's
// Outstanding setup list). Until then this route is code-complete and
// tested, but nothing actually calls it on a timer.
//
// Guarded by CRON_SECRET rather than being open -- otherwise anyone who
// finds this URL could trigger unlimited watch-renewal API calls against
// every connected account. Vercel Cron sends this same bearer convention
// automatically; a pg_net call would need an Authorization header added
// explicitly when that cron job is created.
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET is not configured', { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const result = await renewAllDueWatches();
  return Response.json(result);
}
