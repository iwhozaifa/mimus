import { createServiceClient } from '@/src/db/service';
import { createStripeClient } from '@/src/server/billing/stripe';

export async function createCheckoutSession(params: {
  workspaceId: string;
  companyId: string;
  planId: string;
  priceId: string;
  successUrl: string;
  cancelUrl: string;
}): Promise<string> {
  const supabase = createServiceClient();
  const stripe = createStripeClient();

  const { data: company } = await supabase
    .from('companies')
    .select('stripe_customer_id, name')
    .eq('id', params.companyId)
    .single();

  let customerId = company?.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({ name: company?.name ?? undefined });
    customerId = customer.id;
    await supabase
      .from('companies')
      .update({ stripe_customer_id: customerId })
      .eq('id', params.companyId);
  }

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    customer: customerId,
    line_items: [{ price: params.priceId, quantity: 1 }],
    subscription_data: {
      metadata: { workspace_id: params.workspaceId, plan_id: params.planId },
    },
    success_url: params.successUrl,
    cancel_url: params.cancelUrl,
  });

  if (!session.url) {
    throw new Error('Stripe did not return a checkout URL');
  }
  return session.url;
}
