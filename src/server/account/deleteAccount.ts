import { createServiceClient } from '@/src/db/service';
import { getConnector } from '@/src/server/connectors/bootstrap';
import type { Provider } from '@/src/server/connectors/types';

// Subscription states that still bill (or are about to): deleting a
// workspace in one of these would leave a live Stripe subscription with
// nothing on the Mimus side to manage or cancel it.
const BILLABLE_STATUSES = new Set(['active', 'trialing', 'past_due', 'discounted']);

export class AccountDeletionBlockedError extends Error {
  constructor(public readonly reasons: string[]) {
    super(reasons.join(' '));
    this.name = 'AccountDeletionBlockedError';
  }
}

interface Membership {
  workspace_id: string;
  role: 'owner' | 'manager' | 'member';
  workspaces: { name: string; company_id: string };
}

interface Plan {
  blockers: string[];
  // Workspaces the user is the last active member of -- deleting the user
  // would otherwise leave them orphaned with nobody able to manage them.
  workspacesToDelete: { id: string; companyId: string }[];
}

async function planDeletion(userId: string): Promise<Plan> {
  const supabase = createServiceClient();

  const { data: memberships } = await supabase
    .from('workspace_members')
    .select('workspace_id, role, workspaces!inner(name, company_id)')
    .eq('user_id', userId)
    .eq('status', 'active')
    .overrideTypes<Membership[], { merge: false }>()
    .throwOnError();

  const blockers: string[] = [];
  const workspacesToDelete: Plan['workspacesToDelete'] = [];

  for (const membership of memberships ?? []) {
    const name = membership.workspaces.name;

    const { data: others } = await supabase
      .from('workspace_members')
      .select('role')
      .eq('workspace_id', membership.workspace_id)
      .eq('status', 'active')
      .neq('user_id', userId)
      .throwOnError();

    if ((others ?? []).length === 0) {
      const { data: subscription } = await supabase
        .from('workspace_subscriptions')
        .select('status')
        .eq('workspace_id', membership.workspace_id)
        .maybeSingle()
        .throwOnError();
      if (subscription && BILLABLE_STATUSES.has(subscription.status as string)) {
        blockers.push(`“${name}” has an active subscription. Cancel it on the Billing page first.`);
      }
      workspacesToDelete.push({
        id: membership.workspace_id,
        companyId: membership.workspaces.company_id,
      });
      continue;
    }

    const anotherOwner = (others ?? []).some((other) => other.role === 'owner');
    if (membership.role === 'owner' && !anotherOwner) {
      blockers.push(
        `You're the only Owner of “${name}”, and it has other members. Remove them on the Members page, or contact us to transfer ownership, so your team isn't left without an Owner.`,
      );
    }
  }

  return { blockers, workspacesToDelete };
}

// Reasons the account can't be deleted yet, worded for the user. Empty
// means deleteAccount() will go ahead.
export async function getAccountDeletionBlockers(userId: string): Promise<string[]> {
  return (await planDeletion(userId)).blockers;
}

// Deletes a user and everything that belongs only to them, as the Privacy
// Policy's "Deleting your account" section promises:
//
// 1. Each still-connected account goes through its connector's own
//    disconnect(), so the provider token is revoked (not just forgotten)
//    and imported content is purged.
// 2. Workspaces the user is the last active member of are deleted, with
//    their company once it has no workspaces left.
// 3. The auth.users row is deleted; cascades remove the profile,
//    memberships and any remaining connected-account rows, and migration
//    0018 detaches agent_logs/invites/manager links instead of blocking.
//
// Callers must pass the signed-in user's own id -- this runs entirely as
// the service role.
export async function deleteAccount(userId: string): Promise<void> {
  const { blockers, workspacesToDelete } = await planDeletion(userId);
  if (blockers.length > 0) {
    throw new AccountDeletionBlockedError(blockers);
  }

  const supabase = createServiceClient();

  const { data: accounts } = await supabase
    .from('connected_accounts')
    .select('id, provider')
    .eq('owner_user_id', userId)
    .neq('status', 'disconnected')
    .throwOnError();

  for (const account of accounts ?? []) {
    try {
      await getConnector(account.provider as Provider).disconnect(account.id as string);
    } catch (error) {
      // A token the provider already revoked (or an unreachable provider)
      // must not strand the user with an undeletable account. The content
      // rows still go, through the auth.users cascade below.
      console.error(`account deletion: disconnect failed for ${account.id}`, error);
    }
  }

  if (workspacesToDelete.length > 0) {
    await supabase
      .from('workspaces')
      .delete()
      .in(
        'id',
        workspacesToDelete.map((workspace) => workspace.id),
      )
      .throwOnError();

    for (const companyId of new Set(workspacesToDelete.map((workspace) => workspace.companyId))) {
      const { count } = await supabase
        .from('workspaces')
        .select('id', { count: 'exact', head: true })
        .eq('company_id', companyId)
        .throwOnError();
      if (count === 0) {
        await supabase.from('companies').delete().eq('id', companyId).throwOnError();
      }
    }
  }

  const { error } = await supabase.auth.admin.deleteUser(userId);
  if (error) throw error;
}
