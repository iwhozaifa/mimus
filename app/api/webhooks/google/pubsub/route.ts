import { getConnector } from '@/src/server/connectors/bootstrap';
import { type NextRequest } from 'next/server';

// Kept thin and untested by vitest -- the real logic (OIDC auth
// verification, envelope parsing, history sync) lives in
// src/server/connectors/google/webhook.ts and is covered there. Any
// thrown error (bad auth, malformed payload, a downstream Google/DB call
// failing) becomes a non-2xx response, which tells Pub/Sub to retry with
// its own backoff rather than silently dropping the notification.
export async function POST(request: NextRequest) {
  try {
    return await getConnector('google').handleWebhook(request);
  } catch (err) {
    console.error('Google Pub/Sub push handling failed', err);
    return new Response(null, { status: 500 });
  }
}
