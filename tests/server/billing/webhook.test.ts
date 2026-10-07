import { createServiceClient } from '@/src/db/service';
import { handleStripeWebhookEvent } from '@/src/server/billing/handleStripeWebhookEvent';
import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';

// Signature verification itself is Stripe's own well-tested SDK code and
// needs a real webhook secret to exercise meaningfully -- what's ours to
// test is what happens to workspace_subscriptions once an event has already
// been verified, so these events are hand-built rather than going through
// stripe.webhooks.constructEvent.

describe('handleStripeWebhookEvent', () => {
  const supabase = createServiceClient();

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Billing test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Billing test ws' })
      .select('id')
      .single()
      .throwOnError();
    return workspace!.id as string;
  }

  it('a subscription event activates the workspace', async () => {
    const workspaceId = await makeWorkspace();
    const subscriptionId = `sub_${randomUUID()}`;

    await handleStripeWebhookEvent({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: subscriptionId,
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          metadata: { workspace_id: workspaceId },
        },
      },
    });

    const { data: subscription } = await supabase
      .from('workspace_subscriptions')
      .select('status, stripe_subscription_item_id')
      .eq('workspace_id', workspaceId)
      .single();

    expect(subscription?.status).toBe('active');
    expect(subscription?.stripe_subscription_item_id).toBe(subscriptionId);
  });

  it('a cancellation event marks the workspace canceled', async () => {
    const workspaceId = await makeWorkspace();
    const subscriptionId = `sub_${randomUUID()}`;

    await handleStripeWebhookEvent({
      type: 'customer.subscription.created',
      data: {
        object: {
          id: subscriptionId,
          status: 'active',
          current_period_end: Math.floor(Date.now() / 1000) + 30 * 24 * 60 * 60,
          metadata: { workspace_id: workspaceId },
        },
      },
    });

    await handleStripeWebhookEvent({
      type: 'customer.subscription.deleted',
      data: { object: { id: subscriptionId, metadata: { workspace_id: workspaceId } } },
    });

    const { data: subscription } = await supabase
      .from('workspace_subscriptions')
      .select('status')
      .eq('workspace_id', workspaceId)
      .single();

    expect(subscription?.status).toBe('canceled');
  });

  it('ignores events with no workspace_id in metadata', async () => {
    await expect(
      handleStripeWebhookEvent({
        type: 'customer.subscription.created',
        data: { object: { id: 'sub_orphan', status: 'active', metadata: {} } },
      }),
    ).resolves.toBeUndefined();
  });
});
