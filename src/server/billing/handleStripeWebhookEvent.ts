import { createServiceClient } from '@/src/db/service';

interface StripeSubscriptionLike {
  id: string;
  status?: string;
  current_period_end?: number;
  metadata?: Record<string, string>;
}

export interface StripeWebhookEvent {
  type: string;
  data: { object: StripeSubscriptionLike };
}

// Skeleton simplification: one Stripe Subscription per workspace (not one
// shared Subscription with a line item per workspace, despite the column
// name) -- the plan's full "company = customer, workspace = item" model can
// land once real pricing/plans exist.
const STATUS_MAP: Record<string, 'active' | 'trialing' | 'past_due' | 'canceled' | 'discounted'> = {
  active: 'active',
  trialing: 'trialing',
  past_due: 'past_due',
  canceled: 'canceled',
  unpaid: 'canceled',
  incomplete_expired: 'canceled',
};

export async function handleStripeWebhookEvent(event: StripeWebhookEvent): Promise<void> {
  const subscription = event.data.object;
  const workspaceId = subscription.metadata?.workspace_id;
  if (!workspaceId) {
    return;
  }

  const supabase = createServiceClient();

  if (
    event.type === 'customer.subscription.created' ||
    event.type === 'customer.subscription.updated'
  ) {
    const { error } = await supabase.from('workspace_subscriptions').upsert(
      {
        workspace_id: workspaceId,
        plan_id: subscription.metadata?.plan_id ?? null,
        stripe_subscription_item_id: subscription.id,
        status: STATUS_MAP[subscription.status ?? ''] ?? 'past_due',
        current_period_end: subscription.current_period_end
          ? new Date(subscription.current_period_end * 1000).toISOString()
          : null,
      },
      { onConflict: 'workspace_id' },
    );
    if (error) throw error;
    return;
  }

  if (event.type === 'customer.subscription.deleted') {
    const { error } = await supabase
      .from('workspace_subscriptions')
      .update({ status: 'canceled' })
      .eq('workspace_id', workspaceId);
    if (error) throw error;
  }
}
