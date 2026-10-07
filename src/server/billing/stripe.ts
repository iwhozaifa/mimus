import Stripe from 'stripe';

export function createStripeClient(): Stripe {
  return new Stripe(process.env.STRIPE_SECRET_KEY!);
}
