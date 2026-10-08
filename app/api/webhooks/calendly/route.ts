import { getConnector } from '@/src/server/connectors/bootstrap';
import { type NextRequest } from 'next/server';

// Kept thin and untested by vitest -- the real logic (signature
// verification, re-syncing the referenced event) lives in
// src/server/connectors/calendly/webhook.ts and is covered there.
export async function POST(request: NextRequest) {
  try {
    return await getConnector('calendly').handleWebhook(request);
  } catch (err) {
    console.error('Calendly webhook handling failed', err);
    return new Response(null, { status: 500 });
  }
}
