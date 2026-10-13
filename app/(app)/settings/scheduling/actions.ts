'use server';

import {
  saveSchedulingSettings,
  SettingsError,
  type SchedulingSettings,
} from '@/src/server/scheduling/rules';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { revalidatePath } from 'next/cache';

// Returns the reason instead of throwing it, so the user sees exactly
// what to fix (a thrown server-action error's message is hidden in
// production builds).
export async function saveScheduling(
  settings: SchedulingSettings,
): Promise<{ error: string | null }> {
  const context = await getCurrentWorkspaceContext();
  if (!context) return { error: 'You need to be signed in.' };
  try {
    // Always the signed-in user's own rows, from their verified session.
    await saveSchedulingSettings(context.supabase, context.workspaceId, context.userId, settings);
  } catch (error) {
    if (error instanceof SettingsError) return { error: error.message };
    throw error;
  }
  revalidatePath('/settings/scheduling');
  return { error: null };
}
