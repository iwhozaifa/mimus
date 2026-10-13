// The text of every scheduling email Mimus sends. Built from a fixed
// template, never written by the AI: nothing in the original email --
// which another person wrote, and may contain instructions -- can choose
// what the reply says or who it goes to. The only things carried over are
// the sender's first name (and only when it looks like a name) and the
// subject line.
import type { Slot } from '@/src/server/scheduling/findSlots';

function parts(date: Date, timeZone: string, options: Intl.DateTimeFormatOptions) {
  return Object.fromEntries(
    new Intl.DateTimeFormat('en-US', { timeZone, ...options })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
}

function clock(date: Date, timeZone: string) {
  const p = parts(date, timeZone, { hour: 'numeric', minute: '2-digit', hour12: true });
  return { time: `${p.hour}:${p.minute}`, period: p.dayPeriod as string };
}

function zoneLabel(date: Date, timeZone: string): string {
  if (timeZone === 'UTC') return 'UTC';
  return parts(date, timeZone, { timeZoneName: 'shortOffset' }).timeZoneName as string;
}

// "Tue, Oct 20, 10:00 – 10:30 AM (GMT+5)"
export function formatSlot(slot: Slot, timeZone: string): string {
  const start = new Date(slot.start);
  const end = new Date(slot.end);
  const day = parts(start, timeZone, { weekday: 'short', month: 'short', day: 'numeric' });
  const from = clock(start, timeZone);
  const to = clock(end, timeZone);
  const range =
    from.period === to.period
      ? `${from.time} – ${to.time} ${to.period}`
      : `${from.time} ${from.period} – ${to.time} ${to.period}`;
  return `${day.weekday}, ${day.month} ${day.day}, ${range} (${zoneLabel(start, timeZone)})`;
}

const NAME_WORD = /^\p{L}[\p{L}'’.-]*$/u;

// The first name from a display name, or null when the display name
// doesn't look like a person's name at all.
export function greetingName(displayName: string | null | undefined): string | null {
  const words = displayName?.trim().split(/\s+/) ?? [];
  if (!words.length || words.length > 4) return null;
  if (!words.every((word) => word.length <= 40 && NAME_WORD.test(word))) return null;
  return words[0];
}

export function safeDisplayName(displayName: string | null | undefined): string | null {
  return greetingName(displayName) ? displayName!.trim() : null;
}

export function replySubject(subject: string | null | undefined): string {
  const base = subject?.trim() || 'Meeting';
  return /^re:/i.test(base) ? base : `Re: ${base}`;
}

function greeting(counterpartName: string | null | undefined): string {
  const name = greetingName(counterpartName);
  return name ? `Hi ${name},` : 'Hi,';
}

export type DraftInput =
  | {
      kind: 'offer_times';
      counterpartName: string | null | undefined;
      slots: Slot[];
      timeZone: string;
      durationMinutes: number;
    }
  | {
      kind: 'calendly_link';
      counterpartName: string | null | undefined;
      calendlyUrl: string;
      timeZone: string;
      durationMinutes: number;
    };

export function draftReply(input: DraftInput): string {
  if (input.kind === 'calendly_link') {
    return [
      greeting(input.counterpartName),
      '',
      'Happy to find a time. You can pick whatever suits you here:',
      input.calendlyUrl,
      '',
    ].join('\n');
  }
  return [
    greeting(input.counterpartName),
    '',
    `Happy to find a time. Would any of these work for a ${input.durationMinutes}-minute call?`,
    '',
    ...input.slots.map((slot) => `- ${formatSlot(slot, input.timeZone)}`),
    '',
    'Let me know which suits you and I’ll send an invite.',
    '',
  ].join('\n');
}

export function confirmationReply(input: {
  counterpartName: string | null | undefined;
  slot: Slot;
  timeZone: string;
}): string {
  return [
    greeting(input.counterpartName),
    '',
    `Great, I’ve booked us for ${formatSlot(input.slot, input.timeZone)}. A calendar invite is on its way.`,
    '',
  ].join('\n');
}
