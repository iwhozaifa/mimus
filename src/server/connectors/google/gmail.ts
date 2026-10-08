import type { NormalizedMessage, NormalizedPerson } from '@/src/server/shared/normalize';
import type { gmail_v1 } from 'googleapis';

function findHeader(
  headers: gmail_v1.Schema$MessagePartHeader[] | undefined,
  name: string,
): string | undefined {
  return headers?.find((h) => h.name?.toLowerCase() === name.toLowerCase())?.value ?? undefined;
}

// Handles the "Display Name <email>" and bare-email forms Gmail actually
// sends in From/To/Cc headers -- not the full RFC 2822 address-list
// grammar (groups, quoted-string edge cases), which Gmail's API responses
// don't produce in practice.
function parseAddressList(headerValue: string | undefined): NormalizedPerson[] {
  if (!headerValue) return [];
  return headerValue
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => {
      const match = part.match(/^(.*?)\s*<(.+)>$/);
      if (match) {
        const displayName = match[1].replace(/^"|"$/g, '').trim();
        return { displayName: displayName || undefined, email: match[2].trim() };
      }
      return { email: part };
    });
}

function extractBody(
  part: gmail_v1.Schema$MessagePart | undefined,
  mimeType: string,
): string | undefined {
  if (!part) return undefined;
  if (part.mimeType === mimeType && part.body?.data) {
    return Buffer.from(part.body.data, 'base64url').toString('utf8');
  }
  for (const child of part.parts ?? []) {
    const found = extractBody(child, mimeType);
    if (found) return found;
  }
  return undefined;
}

export function normalizeGmailMessage(message: gmail_v1.Schema$Message): NormalizedMessage {
  const headers = message.payload?.headers;
  const from = parseAddressList(findHeader(headers, 'From'))[0];
  const to = parseAddressList(findHeader(headers, 'To')).map((person) => ({
    person,
    role: 'to' as const,
  }));
  const cc = parseAddressList(findHeader(headers, 'Cc')).map((person) => ({
    person,
    role: 'cc' as const,
  }));
  const bcc = parseAddressList(findHeader(headers, 'Bcc')).map((person) => ({
    person,
    role: 'bcc' as const,
  }));

  return {
    providerMessageId: message.id!,
    threadId: message.threadId ?? undefined,
    subject: findHeader(headers, 'Subject'),
    snippet: message.snippet ?? undefined,
    bodyText: extractBody(message.payload, 'text/plain'),
    bodyHtml: extractBody(message.payload, 'text/html'),
    direction: message.labelIds?.includes('SENT') ? 'outbound' : 'inbound',
    sentAt: message.internalDate ? new Date(Number(message.internalDate)).toISOString() : undefined,
    from,
    participants: [...to, ...cc, ...bcc],
    raw: message as unknown as Record<string, unknown>,
  };
}
