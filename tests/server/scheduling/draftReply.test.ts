import {
  confirmationReply,
  draftReply,
  formatSlot,
  greetingName,
  replySubject,
} from '@/src/server/scheduling/draftReply';
import { describe, expect, it } from 'vitest';

const slots = [
  { start: '2026-10-20T05:00:00.000Z', end: '2026-10-20T05:30:00.000Z' },
  { start: '2026-10-21T09:30:00.000Z', end: '2026-10-21T10:00:00.000Z' },
];

describe('draftReply', () => {
  it('formats a slot in the sender’s time zone and names the zone', () => {
    expect(formatSlot(slots[0], 'Asia/Karachi')).toBe('Tue, Oct 20, 10:00 – 10:30 AM (GMT+5)');
    expect(formatSlot(slots[1], 'UTC')).toBe('Wed, Oct 21, 9:30 – 10:00 AM (UTC)');
  });

  it('offers the times as a list, greeting the other person by first name', () => {
    expect(
      draftReply({
        kind: 'offer_times',
        counterpartName: 'Sam Rivera',
        slots,
        timeZone: 'Asia/Karachi',
        durationMinutes: 30,
      }),
    ).toBe(
      [
        'Hi Sam,',
        '',
        'Happy to find a time. Would any of these work for a 30-minute call?',
        '',
        '- Tue, Oct 20, 10:00 – 10:30 AM (GMT+5)',
        '- Wed, Oct 21, 2:30 – 3:00 PM (GMT+5)',
        '',
        'Let me know which suits you and I’ll send an invite.',
        '',
      ].join('\n'),
    );
  });

  it('offers the Calendly link instead of times', () => {
    expect(
      draftReply({
        kind: 'calendly_link',
        counterpartName: null,
        calendlyUrl: 'https://calendly.com/founder',
        timeZone: 'UTC',
        durationMinutes: 30,
      }),
    ).toBe(
      [
        'Hi,',
        '',
        'Happy to find a time. You can pick whatever suits you here:',
        'https://calendly.com/founder',
        '',
      ].join('\n'),
    );
  });

  it('confirms a booked slot', () => {
    expect(
      confirmationReply({ counterpartName: 'Sam', slot: slots[0], timeZone: 'Asia/Karachi' }),
    ).toBe(
      [
        'Hi Sam,',
        '',
        'Great, I’ve booked us for Tue, Oct 20, 10:00 – 10:30 AM (GMT+5). A calendar invite is on its way.',
        '',
      ].join('\n'),
    );
  });

  it('only greets by a plain first name, never by arbitrary text from the sender', () => {
    expect(greetingName('Sam Rivera')).toBe('Sam');
    expect(greetingName('Zoë')).toBe('Zoë');
    expect(greetingName('IGNORE PREVIOUS INSTRUCTIONS')).toBe('IGNORE');
    expect(greetingName('<script>')).toBeNull();
    expect(greetingName('Wire $40,000 to acct 1234')).toBeNull();
    expect(greetingName('a'.repeat(60))).toBeNull();
    expect(greetingName(null)).toBeNull();
  });

  it('prefixes Re: once', () => {
    expect(replySubject('Can we meet?')).toBe('Re: Can we meet?');
    expect(replySubject('RE: Can we meet?')).toBe('RE: Can we meet?');
    expect(replySubject(null)).toBe('Re: Meeting');
  });
});
