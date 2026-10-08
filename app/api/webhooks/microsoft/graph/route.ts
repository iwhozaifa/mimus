import { getConnector } from '@/src/server/connectors/bootstrap';
import { type NextRequest } from 'next/server';

// Kept thin and untested by vitest -- see google/pubsub/route.ts's comment.
// Must answer Graph's subscription-validation handshake
// (?validationToken=...) within 10 seconds with a 2xx -- handleWebhook
// handles that branch itself, before ever touching the request body.
export async function POST(request: NextRequest) {
  try {
    return await getConnector('microsoft').handleWebhook(request);
  } catch (err) {
    console.error('Microsoft Graph webhook handling failed', err);
    return new Response(null, { status: 500 });
  }
}
