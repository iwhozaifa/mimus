import type { NormalizedMessage, NormalizedPerson } from '@/src/server/shared/normalize';
import type { Message } from '@microsoft/microsoft-graph-types';

function toNormalizedPerson(recipient: Message['from'] | undefined): NormalizedPerson | undefined {
  const address = recipient?.emailAddress;
  if (!address) return undefined;
  return { email: address.address ?? undefined, displayName: address.name ?? undefined };
}

function toRecipients(
  recipients: Message['toRecipients'],
  role: 'to' | 'cc' | 'bcc',
): Array<{ person: NormalizedPerson; role: 'to' | 'cc' | 'bcc' }> {
  return (recipients ?? [])
    .map((r) => toNormalizedPerson(r))
    .filter((person): person is NormalizedPerson => person !== undefined)
    .map((person) => ({ person, role }));
}

// selfEmail is the connected account's own address (external_account_id) --
// Graph messages carry no Gmail-style "SENT" label, so direction is
// inferred by comparing the From address against the mailbox owner
// instead.
export function normalizeGraphMessage(message: Message, selfEmail: string): NormalizedMessage {
  const from = toNormalizedPerson(message.from);
  const direction =
    from?.email && from.email.toLowerCase() === selfEmail.toLowerCase() ? 'outbound' : 'inbound';

  return {
    providerMessageId: message.id!,
    threadId: message.conversationId ?? undefined,
    subject: message.subject ?? undefined,
    snippet: message.bodyPreview ?? undefined,
    bodyText:
      message.body?.contentType === 'text' ? (message.body.content ?? undefined) : undefined,
    bodyHtml:
      message.body?.contentType === 'html' ? (message.body.content ?? undefined) : undefined,
    direction,
    sentAt: message.sentDateTime ?? message.receivedDateTime ?? undefined,
    from,
    participants: [
      ...toRecipients(message.toRecipients, 'to'),
      ...toRecipients(message.ccRecipients, 'cc'),
      ...toRecipients(message.bccRecipients, 'bcc'),
    ],
    raw: message as unknown as Record<string, unknown>,
  };
}
