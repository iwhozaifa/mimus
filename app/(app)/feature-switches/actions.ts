'use server';

import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { revalidatePath } from 'next/cache';

// Enforcement is the `manage_feature_switches` RLS policy (owner-only
// `for all`) on `feature_switches`, not this check -- but we still fail
// fast here with a clear message instead of a silent 0-row write.
export async function setFeatureSwitch(key: string, enabled: boolean) {
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    throw new Error('Not signed in');
  }
  if (context.role !== 'owner') {
    throw new Error('Only workspace owners can manage feature switches');
  }

  const { error } = await context.supabase
    .from('feature_switches')
    .upsert({ workspace_id: context.workspaceId, key, enabled });
  if (error) throw error;

  revalidatePath('/feature-switches');
}
