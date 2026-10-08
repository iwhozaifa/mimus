import { getConnector } from '@/src/server/connectors/bootstrap';
import { type NextRequest } from 'next/server';

// Kept thin and untested by vitest -- the real logic (signature
// verification, url_verification handshake, event ingestion) lives in
// src/server/connectors/slack/events.ts and is covered there. Must answer
// within 3 seconds; a non-2xx here tells Slack to retry with its own
// backoff (and eventually disable the subscription if it keeps failing),
// so only an actual processing failure should return one -- an invalid
// signature is answered 401 directly inside handleWebhook, not thrown.
export async function POST(request: NextRequest) {
  try {
    return await getConnector('slack').handleWebhook(request);
  } catch (err) {
    console.error('Slack events webhook handling failed', err);
    return new Response(null, { status: 500 });
  }
}
