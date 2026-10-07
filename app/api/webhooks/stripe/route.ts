import {
  handleStripeWebhookEvent,
  type StripeWebhookEvent,
} from '@/src/server/billing/handleStripeWebhookEvent';
import { createStripeClient } from '@/src/server/billing/stripe';
import { type NextRequest } from 'next/server';

export async function POST(request: NextRequest) {
  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return new Response('Missing signature', { status: 400 });
  }

  const rawBody = await request.text();
  const stripe = createStripeClient();

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, process.env.STRIPE_WEBHOOK_SECRET!);
  } catch {
    return new Response('Invalid signature', { status: 400 });
  }

  // Only a handful of subscription-event fields matter to our handler;
  // Stripe's full discriminated Event union is narrower than what we accept
  // here, so the irrelevant event types this never touches are cast away.
  await handleStripeWebhookEvent(event as unknown as StripeWebhookEvent);

  return new Response(null, { status: 200 });
}
