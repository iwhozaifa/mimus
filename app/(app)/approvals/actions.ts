'use server';

import {
  createSchedulingProposal,
  decideProposal,
  ProposalError,
  type Decision,
} from '@/src/server/scheduling/proposals';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';

// Both actions return the user-facing reason instead of throwing it:
// production builds replace a thrown server-action error's message with a
// generic one, and the user needs to know what went wrong.

export async function proposeMeetingTimes(messageId: string): Promise<{ error: string }> {
  const context = await getCurrentWorkspaceContext();
  if (!context) return { error: 'You need to be signed in.' };
  try {
    await createSchedulingProposal(context, { messageId });
  } catch (error) {
    if (error instanceof ProposalError) return { error: error.message };
    throw error;
  }
  redirect('/approvals');
}

export async function decide(
  proposalId: string,
  decision: Decision,
): Promise<{ error: string | null }> {
  const context = await getCurrentWorkspaceContext();
  if (!context) return { error: 'You need to be signed in.' };
  try {
    await decideProposal(context, proposalId, decision);
    return { error: null };
  } catch (error) {
    if (error instanceof ProposalError) return { error: error.message };
    throw error;
  } finally {
    revalidatePath('/approvals');
  }
}
