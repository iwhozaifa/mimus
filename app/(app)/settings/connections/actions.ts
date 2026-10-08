'use server';

import { assertWorkspaceWritable } from '@/src/server/billing/killSwitch';
import { getConnector } from '@/src/server/connectors/bootstrap';
import type { Provider } from '@/src/server/connectors/types';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { revalidatePath } from 'next/cache';

async function requireContext() {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    throw new Error('Not signed in');
  }
  return context;
}

export async function updateConnectionVisibility(
  connectedAccountId: string,
  visibility: 'private' | 'team' | 'company',
) {
  const { supabase, workspaceId } = await requireContext();
  await assertWorkspaceWritable(workspaceId);
  const { error } = await supabase
    .from('connected_accounts')
    .update({ visibility })
    .eq('id', connectedAccountId);
  if (error) throw error;
  revalidatePath('/settings/connections');
}

export async function disconnectAccount(connectedAccountId: string) {
  const { supabase, workspaceId } = await requireContext();
  await assertWorkspaceWritable(workspaceId);

  // This update, through the signed-in user's own RLS-scoped client, is
  // the authorization check -- it only succeeds under
  // update_connected_accounts' policy (owner or workspace Owner). The
  // connector's disconnect() then does the work RLS structurally can't
  // authorize (revoking the provider token, purging content rows), via
  // the service role.
  const { data, error } = await supabase
    .from('connected_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', connectedAccountId)
    .select('provider')
    .single();
  if (error) throw error;

  await getConnector(data.provider as Provider).disconnect(connectedAccountId);
  revalidatePath('/settings/connections');
}
