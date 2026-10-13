'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import type { SchedulingSettings } from '@/src/server/scheduling/rules';
import { saveScheduling } from './actions';

const LEVELS = [
  {
    level: 1,
    title: 'Draft only',
    detail: 'Mimus writes the reply. You copy it and send it yourself. Nothing is sent or booked.',
  },
  {
    level: 2,
    title: 'Approve every send and booking',
    detail: 'Each reply and each booking waits in Approvals until you say yes. (Default)',
  },
  {
    level: 3,
    title: 'Offers go out automatically',
    detail:
      'A reply that only offers times or your Calendly link is sent straight away. Booking a meeting still waits for you.',
  },
  {
    level: 4,
    title: 'Fully automatic',
    detail:
      'Mimus sends the reply and books the earliest free time without asking. Everything is listed in Approvals.',
  },
];

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

const inputClass =
  'rounded-md border border-line-muted bg-paper-raised px-3 py-2 text-sm text-ink disabled:opacity-50';

export function SchedulingForm({
  initial,
  calendars,
  hasCalendly,
}: {
  initial: SchedulingSettings;
  calendars: Array<{ id: string; label: string }>;
  hasCalendly: boolean;
}) {
  const [settings, setSettings] = useState(initial);
  const [pending, setPending] = useState(false);
  const [status, setStatus] = useState<{ error: string | null } | null>(null);

  const set = <K extends keyof SchedulingSettings>(key: K, value: SchedulingSettings[K]) => {
    setSettings((current) => ({ ...current, [key]: value }));
    setStatus(null);
  };

  return (
    <form
      className="flex flex-col gap-8"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        try {
          setStatus(await saveScheduling(settings));
        } catch {
          setStatus({ error: 'Couldn’t save. Try again.' });
        } finally {
          setPending(false);
        }
      }}
    >
      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold text-ink">Approval level</legend>
        {LEVELS.map((option) => (
          <label
            key={option.level}
            className="flex cursor-pointer gap-3 rounded-md border border-line-muted p-4 has-checked:border-accent"
          >
            <input
              type="radio"
              name="level"
              className="mt-1"
              checked={settings.level === option.level}
              onChange={() => set('level', option.level)}
            />
            <span className="flex flex-col">
              <span className="font-medium text-ink">
                {option.level}. {option.title}
              </span>
              <span className="text-sm text-ink-muted">{option.detail}</span>
            </span>
          </label>
        ))}
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink">Working hours</legend>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Time zone
          <input
            className={`${inputClass} max-w-xs`}
            value={settings.timeZone}
            onChange={(event) => set('timeZone', event.target.value)}
            placeholder="Europe/London"
          />
        </label>
        <div className="flex flex-wrap gap-4">
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            Day starts
            <input
              type="time"
              className={inputClass}
              value={settings.workStart}
              onChange={(event) => set('workStart', event.target.value)}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm text-ink-muted">
            Day ends
            <input
              type="time"
              className={inputClass}
              value={settings.workEnd}
              onChange={(event) => set('workEnd', event.target.value)}
            />
          </label>
        </div>
        <div role="group" aria-label="Working days" className="flex flex-wrap gap-3">
          {DAYS.map((day, index) => {
            const iso = index + 1;
            return (
              <label key={day} className="flex items-center gap-1.5 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={settings.workingDays.includes(iso)}
                  onChange={(event) =>
                    set(
                      'workingDays',
                      event.target.checked
                        ? [...settings.workingDays, iso]
                        : settings.workingDays.filter((d) => d !== iso),
                    )
                  }
                />
                {day}
              </label>
            );
          })}
        </div>
      </fieldset>

      <fieldset className="flex flex-wrap gap-4">
        <legend className="mb-2 text-lg font-semibold text-ink">Meetings</legend>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Length (minutes)
          <select
            className={inputClass}
            value={settings.defaultDurationMinutes}
            onChange={(event) => set('defaultDurationMinutes', Number(event.target.value))}
          >
            {[15, 30, 45, 60, 90].map((minutes) => (
              <option key={minutes} value={minutes}>
                {minutes}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Buffer between meetings (minutes)
          <input
            type="number"
            min={0}
            max={120}
            className={`${inputClass} w-28`}
            value={settings.bufferMinutes}
            onChange={(event) => set('bufferMinutes', Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Minimum notice (hours)
          <input
            type="number"
            min={0}
            max={336}
            className={`${inputClass} w-28`}
            value={settings.minNoticeHours}
            onChange={(event) => set('minNoticeHours', Number(event.target.value))}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Times to offer
          <select
            className={inputClass}
            value={settings.offerCount}
            onChange={(event) => set('offerCount', Number(event.target.value))}
          >
            <option value={2}>2</option>
            <option value={3}>3</option>
          </select>
        </label>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="mb-2 text-lg font-semibold text-ink">Booking</legend>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Book into
          <select
            className={`${inputClass} max-w-md`}
            value={settings.bookingCalendarAccountId ?? ''}
            onChange={(event) => set('bookingCalendarAccountId', event.target.value || null)}
          >
            <option value="">The calendar that came with the email account</option>
            {calendars.map((calendar) => (
              <option key={calendar.id} value={calendar.id}>
                {calendar.label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={settings.addVideoLink}
            onChange={(event) => set('addVideoLink', event.target.checked)}
          />
          Add a Google Meet or Teams link to meetings Mimus books
        </label>
        <label className="flex items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={settings.preferCalendlyLink}
            disabled={!hasCalendly && !settings.preferCalendlyLink}
            onChange={(event) => set('preferCalendlyLink', event.target.checked)}
          />
          Send my Calendly link instead of offering times
          {!hasCalendly && <span className="text-ink-faint">(connect Calendly first)</span>}
        </label>
      </fieldset>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? 'Saving…' : 'Save'}
        </Button>
        {status &&
          (status.error ? (
            <p role="alert" className="text-sm text-danger">
              {status.error}
            </p>
          ) : (
            <p className="text-sm text-ink-muted">Saved</p>
          ))}
      </div>
    </form>
  );
}
