'use server';

import { AccountDeletionBlockedError, deleteAccount } from '@/src/server/account/deleteAccount';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { redirect } from 'next/navigation';

// Returns the blocking reason instead of throwing it: production builds
// replace a thrown server-action error's message with a generic one, and
// the user needs to see exactly what to fix.
export async function deleteMyAccount(confirmation: string): Promise<{ error: string }> {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return { error: 'You need to be signed in to delete your account.' };
  }
  if (confirmation.trim().toLowerCase() !== 'delete') {
    return { error: 'Type delete to confirm.' };
  }

  try {
    // Always the signed-in user's own id, from their verified session --
    // never an id the client sent.
    await deleteAccount(context.userId);
  } catch (error) {
    if (error instanceof AccountDeletionBlockedError) {
      return { error: error.message };
    }
    throw error;
  }

  // The auth user is gone, so only the local session cookies are left to
  // clear -- a server-side sign-out would fail for a user that no longer
  // exists.
  await context.supabase.auth.signOut({ scope: 'local' });
  redirect('/account-deleted');
}
