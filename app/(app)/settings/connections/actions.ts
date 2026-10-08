'use server';

import { assertWorkspaceWritable } from '@/src/server/billing/killSwitch';
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
  const { error } = await supabase
    .from('connected_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', connectedAccountId);
  if (error) throw error;
  revalidatePath('/settings/connections');
}
