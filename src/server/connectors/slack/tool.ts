import { createServiceClient } from '@/src/db/service';
import { canSeeConnectedAccount } from '@/src/server/permissions/connectedAccounts';

export interface VisibleSlackMessage {
  id: string;
  connectedAccountId: string;
  threadId: string | null;
  bodyText: string | null;
  sentAt: string | null;
  fromPersonId: string | null;
}

const DEFAULT_LIMIT = 50;

// The narrow surface the AI tool layer (Milestone 4) will call instead of
// ever touching Slack's API or a connected_account's stored token
// directly -- see the architecture doc's "Slack is the one connector the
// AI never calls directly" note. Every row this can return was already
// written by backfill.ts/events.ts using the *connecting member's own*
// token to resolve channel membership at ingestion time, so this
// function's remaining job is the same defense-in-depth re-check every
// permission-engine wrapper does: confirm the asker can still see each
// candidate connected_account_id -- via the exact predicate RLS itself
// enforces on the messages table -- before it's included in the query
// scope, rather than trusting a single broader query to get the
// visibility right on its own.
export async function listVisibleSlackMessages(params: {
  askerUserId: string;
  workspaceId: string;
  limit?: number;
}): Promise<VisibleSlackMessage[]> {
  const supabase = createServiceClient();
  const { data: accounts, error } = await supabase
    .from('connected_accounts')
    .select('id')
    .eq('workspace_id', params.workspaceId)
    .eq('provider', 'slack')
    .eq('status', 'connected');
  if (error) throw error;
  if (!accounts?.length) return [];

  const checks = await Promise.all(
    accounts.map(async (account) => ({
      id: account.id as string,
      visible: await canSeeConnectedAccount(params.askerUserId, account.id as string),
    })),
  );
  const visibleAccountIds = checks.filter((check) => check.visible).map((check) => check.id);
  if (!visibleAccountIds.length) return [];

  const { data: messages, error: messagesError } = await supabase
    .from('messages')
    .select('id, connected_account_id, thread_id, body_text, sent_at, from_person_id')
    .in('connected_account_id', visibleAccountIds)
    .order('sent_at', { ascending: false, nullsFirst: false })
    .limit(params.limit ?? DEFAULT_LIMIT);
  if (messagesError) throw messagesError;

  return (messages ?? []).map((message) => ({
    id: message.id as string,
    connectedAccountId: message.connected_account_id as string,
    threadId: message.thread_id as string | null,
    bodyText: message.body_text as string | null,
    sentAt: message.sent_at as string | null,
    fromPersonId: message.from_person_id as string | null,
  }));
}
