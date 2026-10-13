// Scheduling proposals: a drafted reply to someone asking to meet, and the
// user's decision on it. Reads run under the user's own session (RLS), and
// a proposal only ever moves on through claim_scheduling_proposal(), which
// checks the caller and the status atomically. The provider calls that
// send and book are system writes through connectors/write.ts, with the
// stored tokens of the user's own account.
import { createServiceClient } from '@/src/db/service';
import { assertWorkspaceWritable } from '@/src/server/billing/killSwitch';
import type { Provider } from '@/src/server/connectors/types';
import { createCalendarEvent, sendReply } from '@/src/server/connectors/write';
import { canSendAndBook } from '@/src/server/connectors/writeScopes';
import { emitSignal } from '@/src/server/events/emit';
import { assertFeatureEnabled } from '@/src/server/permissions/featureSwitches';
import {
  confirmationReply,
  draftReply,
  replySubject,
  safeDisplayName,
} from '@/src/server/scheduling/draftReply';
import { findSlots, type Slot } from '@/src/server/scheduling/findSlots';
import { getBusyIntervals } from '@/src/server/scheduling/freeBusy';
import {
  loadApprovalLevel,
  loadSchedulingRules,
  type SchedulingRules,
} from '@/src/server/scheduling/rules';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface ProposalContext {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  now?: Date;
}

export type ProposalStatus =
  'draft_only' | 'pending' | 'offered' | 'executing' | 'booked' | 'sent' | 'rejected';

export interface Proposal {
  id: string;
  workspace_id: string;
  user_id: string;
  source_message_id: string;
  email_account_id: string;
  counterpart_emails: string[];
  subject: string | null;
  thread_id: string | null;
  kind: 'offer_times' | 'calendly_link';
  slots: Slot[];
  calendly_url: string | null;
  duration_minutes: number;
  time_zone: string;
  draft_body: string;
  status: ProposalStatus;
  previous_status: ProposalStatus | null;
  chosen_slot: Slot | null;
  provider_event_id: string | null;
  provider_sent_message_id: string | null;
  error: string | null;
  created_at: string;
  decided_at: string | null;
}

export type Decision =
  | { action: 'send_offer' }
  | { action: 'send_link' }
  | { action: 'reject' }
  | { action: 'book'; slot: Slot };

// A problem the user can act on; its message is safe to show them.
export class ProposalError extends Error {}

const WINDOW_DAYS = 14;
const NEEDS_WRITE_ACCESS =
  'To send this from Mimus, allow sending and booking for this account on the Connections page.';

interface SourceMessage {
  id: string;
  subject: string | null;
  thread_id: string | null;
  direction: 'inbound' | 'outbound';
  connected_account_id: string;
  connected_accounts: {
    owner_user_id: string;
    account_type: string;
    provider: Provider;
    scopes: string[] | null;
    status: string;
    external_account_id: string | null;
  };
  from_person: { email: string | null; display_name: string | null } | null;
  message_participants: Array<{
    role: string;
    people: { email: string | null; display_name: string | null } | null;
  }>;
}

// Who the reply goes to: the sender of an incoming message, or the
// recipients of one the user sent -- never an address taken from the body.
function counterparts(message: SourceMessage) {
  const self = message.connected_accounts.external_account_id?.toLowerCase();
  const people =
    message.direction === 'inbound'
      ? [message.from_person]
      : message.message_participants.filter((p) => p.role === 'to').map((p) => p.people);
  const unique = new Map<string, string | null>();
  for (const person of people) {
    const email = person?.email?.trim().toLowerCase();
    if (email && email !== self && !unique.has(email)) unique.set(email, person!.display_name);
  }
  return [...unique].map(([email, name]) => ({ email, name }));
}

async function loadOwnMessage(ctx: ProposalContext, messageId: string): Promise<SourceMessage> {
  const { data: message, error } = await ctx.supabase
    .from('messages')
    .select(
      'id, subject, thread_id, direction, connected_account_id, connected_accounts!inner(owner_user_id, account_type, provider, scopes, status, external_account_id), from_person:people!messages_from_person_id_fkey(email, display_name), message_participants(role, people(email, display_name))',
    )
    .eq('id', messageId)
    .maybeSingle<SourceMessage>();
  if (error) throw error;
  if (!message) throw new ProposalError('That message was not found.');
  if (
    message.connected_accounts.owner_user_id !== ctx.userId ||
    message.connected_accounts.account_type !== 'email'
  ) {
    throw new ProposalError('You can only schedule from emails in your own inbox.');
  }
  return message;
}

async function calendlyLink(ctx: ProposalContext): Promise<string | null> {
  const { data } = await ctx.supabase
    .from('connected_accounts')
    .select('scheduling_url')
    .eq('owner_user_id', ctx.userId)
    .eq('workspace_id', ctx.workspaceId)
    .eq('provider', 'calendly')
    .eq('status', 'connected')
    .not('scheduling_url', 'is', null)
    .limit(1)
    .maybeSingle();
  return data?.scheduling_url ?? null;
}

// Drafts a scheduling reply to a message in the user's own inbox, then
// takes whatever step the user's approval level allows without asking.
export async function createSchedulingProposal(
  ctx: ProposalContext,
  input: { messageId: string; durationMinutes?: number },
): Promise<Proposal> {
  const now = ctx.now ?? new Date();
  const message = await loadOwnMessage(ctx, input.messageId);
  const people = counterparts(message);
  if (!people.length) throw new ProposalError('Couldn’t tell who to reply to.');

  const [rules, level] = await Promise.all([
    loadSchedulingRules(ctx.supabase, ctx.workspaceId, ctx.userId),
    loadApprovalLevel(ctx.supabase, ctx.workspaceId, ctx.userId),
  ]);
  const durationMinutes = input.durationMinutes ?? rules.defaultDurationMinutes;
  const counterpartName = people[0].name;

  const link = rules.preferCalendlyLink ? await calendlyLink(ctx) : null;
  let slots: Slot[] = [];
  if (!link) {
    const to = new Date(now.getTime() + WINDOW_DAYS * 86_400_000);
    const { busy } = await getBusyIntervals(ctx, now, to);
    slots = findSlots(busy, rules, {
      from: now,
      to,
      now,
      durationMinutes,
      count: rules.offerCount,
    });
    if (!slots.length) {
      throw new ProposalError(
        `There’s no free time in your working hours over the next ${WINDOW_DAYS} days.`,
      );
    }
  }

  const account = message.connected_accounts;
  const writable =
    account.status === 'connected' && canSendAndBook(account.provider, account.scopes);
  const { data: inserted, error } = await ctx.supabase
    .from('scheduling_proposals')
    .insert({
      workspace_id: ctx.workspaceId,
      user_id: ctx.userId,
      source_message_id: message.id,
      email_account_id: message.connected_account_id,
      counterpart_emails: people.map((p) => p.email),
      subject: message.subject,
      thread_id: message.thread_id,
      kind: link ? 'calendly_link' : 'offer_times',
      slots,
      calendly_url: link,
      duration_minutes: durationMinutes,
      time_zone: rules.timeZone,
      draft_body: link
        ? draftReply({
            kind: 'calendly_link',
            counterpartName,
            calendlyUrl: link,
            timeZone: rules.timeZone,
            durationMinutes,
          })
        : draftReply({
            kind: 'offer_times',
            counterpartName,
            slots,
            timeZone: rules.timeZone,
            durationMinutes,
          }),
      status: level === 1 || !writable ? 'draft_only' : 'pending',
      error: level > 1 && !writable ? NEEDS_WRITE_ACCESS : null,
    })
    .select('*')
    .single<Proposal>();
  if (error) throw error;

  const automatic: Decision | null =
    inserted.status !== 'pending' || level < 3
      ? null
      : inserted.kind === 'calendly_link'
        ? { action: 'send_link' }
        : level === 4
          ? { action: 'book', slot: inserted.slots[0] }
          : { action: 'send_offer' };
  if (!automatic) return inserted;

  try {
    return await decideProposal(ctx, inserted.id, automatic);
  } catch (err) {
    // The proposal is still there, pending with the error, for the user.
    if (!(err instanceof ProposalError)) throw err;
    return loadProposal(ctx, inserted.id);
  }
}

async function loadProposal(ctx: ProposalContext, id: string): Promise<Proposal> {
  const { data, error } = await ctx.supabase
    .from('scheduling_proposals')
    .select('*')
    .eq('id', id)
    .maybeSingle<Proposal>();
  if (error) throw error;
  if (!data) throw new ProposalError('That scheduling proposal was not found.');
  return data;
}

const CLAIM_ERRORS: Record<string, string> = {
  P0002: 'That scheduling proposal was not found.',
  '22023': 'That doesn’t apply to this proposal.',
  '55000': 'This proposal has already been handled, or can only be sent from your own email app.',
};

async function claim(ctx: ProposalContext, id: string, action: Decision['action']) {
  const { data, error } = await ctx.supabase
    .rpc('claim_scheduling_proposal', { p_id: id, p_action: action })
    .single<Proposal>();
  if (error) throw new ProposalError(CLAIM_ERRORS[error.code] ?? error.message);
  return data;
}

async function finish(id: string, fields: Partial<Proposal>): Promise<Proposal> {
  const { data } = await createServiceClient()
    .from('scheduling_proposals')
    .update({ ...fields, pending_action: null, previous_status: null })
    .eq('id', id)
    .select('*')
    .single<Proposal>()
    .throwOnError();
  return data!;
}

// The calendar a booking goes into: the one chosen in the user's rules, or
// else the calendar that came with the email account.
async function bookingCalendar(proposal: Proposal, rules: SchedulingRules): Promise<string> {
  if (rules.bookingCalendarAccountId) return rules.bookingCalendarAccountId;
  const service = createServiceClient();
  const { data: email } = await service
    .from('connected_accounts')
    .select('workspace_id, owner_user_id, provider, external_account_id')
    .eq('id', proposal.email_account_id)
    .single()
    .throwOnError();
  const { data: calendar } = await service
    .from('connected_accounts')
    .select('id')
    .eq('workspace_id', email!.workspace_id)
    .eq('owner_user_id', email!.owner_user_id)
    .eq('provider', email!.provider)
    .ilike('external_account_id', email!.external_account_id ?? '')
    .eq('account_type', 'calendar')
    .eq('status', 'connected')
    .limit(1)
    .maybeSingle()
    .throwOnError();
  if (!calendar) {
    throw new ProposalError(
      'There’s no calendar to book into. Connect one, or choose one in Scheduling settings.',
    );
  }
  return calendar.id;
}

async function counterpartName(proposal: Proposal): Promise<string | null> {
  const { data } = await createServiceClient()
    .from('messages')
    .select('from_person:people!messages_from_person_id_fkey(display_name)')
    .eq('id', proposal.source_message_id)
    .maybeSingle<{ from_person: { display_name: string | null } | null }>();
  return data?.from_person?.display_name ?? null;
}

const sameSlot = (a: Slot, b: Slot) =>
  new Date(a.start).getTime() === new Date(b.start).getTime() &&
  new Date(a.end).getTime() === new Date(b.end).getTime();

// The user's decision on a proposal: send the offered times or the
// Calendly link, book one of the offered slots, or reject it.
export async function decideProposal(
  ctx: ProposalContext,
  id: string,
  decision: Decision,
): Promise<Proposal> {
  if (decision.action !== 'reject') {
    try {
      await assertWorkspaceWritable(ctx.workspaceId);
      await assertFeatureEnabled(ctx.workspaceId, 'scheduling');
    } catch (err) {
      throw new ProposalError((err as Error).message);
    }
  }

  if (decision.action === 'book') {
    const current = await loadProposal(ctx, id);
    if (!current.slots.some((slot) => sameSlot(slot, decision.slot))) {
      throw new ProposalError('Pick one of the offered times.');
    }
  }

  const claimed = await claim(ctx, id, decision.action);
  if (decision.action === 'reject') return claimed;

  const reply = (body: string) =>
    sendReply(claimed.email_account_id, {
      sourceMessageId: claimed.source_message_id,
      to: claimed.counterpart_emails,
      subject: replySubject(claimed.subject),
      body,
    });

  try {
    if (decision.action !== 'book') {
      const sent = await reply(claimed.draft_body);
      return await finish(id, {
        status: decision.action === 'send_offer' ? 'offered' : 'sent',
        provider_sent_message_id: sent.providerMessageId,
        decided_at: decision.action === 'send_link' ? new Date().toISOString() : null,
        error: null,
      });
    }

    const rules = await loadSchedulingRules(ctx.supabase, ctx.workspaceId, ctx.userId);
    const calendarAccountId = await bookingCalendar(claimed, rules);
    const name = safeDisplayName(await counterpartName(claimed));
    const event = await createCalendarEvent(calendarAccountId, {
      title: `Meeting with ${name ?? claimed.counterpart_emails.join(', ')}`,
      description: `Booked with Mimus. ${replySubject(claimed.subject)}`,
      start: decision.slot.start,
      end: decision.slot.end,
      attendees: claimed.counterpart_emails,
      videoLink: rules.addVideoLink,
    });

    // The meeting exists from here on, so a failed confirmation email is
    // recorded rather than undoing the booking.
    let confirmationError: string | null = null;
    try {
      await reply(
        confirmationReply({
          counterpartName: name,
          slot: decision.slot,
          timeZone: claimed.time_zone,
        }),
      );
    } catch (err) {
      confirmationError = `Booked, but the confirmation email failed: ${(err as Error).message}`;
    }
    const booked = await finish(id, {
      status: 'booked',
      chosen_slot: decision.slot,
      provider_event_id: event.providerEventId,
      decided_at: new Date().toISOString(),
      error: confirmationError,
    });
    await emitSignal(
      ctx.workspaceId,
      'meeting.booked',
      { proposalId: id, providerEventId: event.providerEventId },
      calendarAccountId,
    );
    return booked;
  } catch (err) {
    const message = (err as Error).message;
    await finish(id, { status: claimed.previous_status ?? 'pending', error: message });
    throw new ProposalError(message);
  }
}
