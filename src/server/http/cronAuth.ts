// Shared guard for app/api/cron/** routes. Vercel Cron sends
// `Authorization: Bearer $CRON_SECRET` on every scheduled call; a manual
// or pg_net call has to send the same header. Without it, anyone who
// found a cron URL could trigger unlimited provider API calls.
// Returns the response to send back, or null when the call may proceed.
export function cronAuthError(request: Request): Response | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response('CRON_SECRET is not configured', { status: 500 });
  }
  if (request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  return null;
}
