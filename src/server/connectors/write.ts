// The one way app and scheduling code sends email or creates calendar
// events. Each call checks the account is connected and was granted the
// send-and-book permissions (writeScopes.ts) before the provider is asked.
import { createServiceClient } from '@/src/db/service';
import { getConnector } from '@/src/server/connectors/bootstrap';
import type {
  NewCalendarEvent,
  Provider,
  ReplyDraft,
  SendResult,
} from '@/src/server/connectors/types';
import { canSendAndBook } from '@/src/server/connectors/writeScopes';

export class WriteAccessError extends Error {}

async function writableAccount(accountId: string, accountType: 'email' | 'calendar') {
  const { data: account, error } = await createServiceClient()
    .from('connected_accounts')
    .select('provider, account_type, status, scopes')
    .eq('id', accountId)
    .single();
  if (error) throw error;
  if (account.account_type !== accountType || account.status !== 'connected') {
    throw new WriteAccessError(`That ${accountType} account isn't connected.`);
  }
  if (!canSendAndBook(account.provider as Provider, account.scopes)) {
    throw new WriteAccessError(
      'Mimus isn’t allowed to send or book from this account yet. Allow it on the Connections page.',
    );
  }
  return getConnector(account.provider as Provider);
}

export async function sendReply(emailAccountId: string, draft: ReplyDraft): Promise<SendResult> {
  const connector = await writableAccount(emailAccountId, 'email');
  if (!connector.sendReply) throw new WriteAccessError('This provider can’t send replies.');
  return connector.sendReply(emailAccountId, draft);
}

export async function createCalendarEvent(
  calendarAccountId: string,
  event: NewCalendarEvent,
): Promise<{ providerEventId: string }> {
  const connector = await writableAccount(calendarAccountId, 'calendar');
  if (!connector.createEvent) throw new WriteAccessError('This provider can’t create events.');
  return connector.createEvent(calendarAccountId, event);
}
