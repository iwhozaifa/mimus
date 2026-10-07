'use server';

import { createClient } from '@/src/db/server';
import { revalidatePath } from 'next/cache';

async function requireSession() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const userId = data?.claims.sub as string | undefined;
  if (!userId) {
    throw new Error('Not signed in');
  }
  return { supabase, userId };
}

export async function connectStubAccount(workspaceId: string) {
  const { supabase, userId } = await requireSession();
  const { error } = await supabase.from('connected_accounts').insert({
    workspace_id: workspaceId,
    owner_user_id: userId,
    provider: 'google',
    account_type: 'email',
    visibility: 'private',
    external_account_id: `stub-${crypto.randomUUID()}`,
  });
  if (error) throw error;
  revalidatePath('/settings/connections');
}

export async function updateConnectionVisibility(
  connectedAccountId: string,
  visibility: 'private' | 'team' | 'company',
) {
  const { supabase } = await requireSession();
  const { error } = await supabase
    .from('connected_accounts')
    .update({ visibility })
    .eq('id', connectedAccountId);
  if (error) throw error;
  revalidatePath('/settings/connections');
}

export async function disconnectAccount(connectedAccountId: string) {
  const { supabase } = await requireSession();
  const { error } = await supabase
    .from('connected_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', connectedAccountId);
  if (error) throw error;
  revalidatePath('/settings/connections');
}
