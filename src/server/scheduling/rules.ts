import { DEFAULT_RULES, type SlotRules } from '@/src/server/scheduling/findSlots';
import type { SupabaseClient } from '@supabase/supabase-js';

export interface SchedulingRules extends SlotRules {
  defaultDurationMinutes: number;
  offerCount: number;
  preferCalendlyLink: boolean;
  bookingCalendarAccountId: string | null;
  addVideoLink: boolean;
}

export const DEFAULT_SCHEDULING_RULES: SchedulingRules = {
  ...DEFAULT_RULES,
  defaultDurationMinutes: 30,
  offerCount: 3,
  preferCalendlyLink: false,
  bookingCalendarAccountId: null,
  addVideoLink: true,
};

// 1 = draft only, 2 = approve everything (default), 3 = offers go out
// automatically but bookings need approval, 4 = fully automatic. See
// supabase/migrations/0019_scheduling.sql.
export type ApprovalLevel = 1 | 2 | 3 | 4;
export const DEFAULT_APPROVAL_LEVEL: ApprovalLevel = 2;

const hhmm = (time: string) => time.slice(0, 5);

// The user's own rules (read under their session), or the defaults when
// they haven't saved any.
export async function loadSchedulingRules(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<SchedulingRules> {
  const { data, error } = await supabase
    .from('scheduling_rules')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return DEFAULT_SCHEDULING_RULES;
  return {
    timeZone: data.time_zone,
    workingDays: data.working_days,
    workStart: hhmm(data.work_start),
    workEnd: hhmm(data.work_end),
    bufferMinutes: data.buffer_minutes,
    minNoticeHours: data.min_notice_hours,
    defaultDurationMinutes: data.default_duration_minutes,
    offerCount: data.offer_count,
    preferCalendlyLink: data.prefer_calendly_link,
    bookingCalendarAccountId: data.booking_calendar_account_id,
    addVideoLink: data.add_video_link,
  };
}

export async function loadApprovalLevel(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
): Promise<ApprovalLevel> {
  const { data, error } = await supabase
    .from('approval_settings')
    .select('level')
    .eq('workspace_id', workspaceId)
    .eq('user_id', userId)
    .maybeSingle();
  if (error) throw error;
  return (data?.level as ApprovalLevel | undefined) ?? DEFAULT_APPROVAL_LEVEL;
}

// A problem with what the user entered; safe to show them.
export class SettingsError extends Error {}

export interface SchedulingSettings extends SchedulingRules {
  level: number;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

function validate(settings: SchedulingSettings) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: settings.timeZone });
  } catch {
    throw new SettingsError('Choose a time zone like Europe/London or America/New_York.');
  }
  if (!TIME.test(settings.workStart) || !TIME.test(settings.workEnd)) {
    throw new SettingsError('Working hours need a start and end time.');
  }
  if (settings.workStart >= settings.workEnd) {
    throw new SettingsError('Your day has to end after it starts.');
  }
  if (!settings.workingDays.length || settings.workingDays.some((d) => d < 1 || d > 7)) {
    throw new SettingsError('Pick at least one working day.');
  }
  const ranges: Array<[number, number, number, string]> = [
    [settings.level, 1, 4, 'Choose an approval level.'],
    [settings.offerCount, 2, 3, 'Offer two or three times.'],
    [settings.defaultDurationMinutes, 15, 480, 'Meetings run 15 minutes to 8 hours.'],
    [settings.bufferMinutes, 0, 120, 'The buffer can be up to two hours.'],
    [settings.minNoticeHours, 0, 336, 'Notice can be up to two weeks.'],
  ];
  for (const [value, min, max, message] of ranges) {
    if (!Number.isInteger(value) || value < min || value > max) throw new SettingsError(message);
  }
}

// Saved under the user's own session: RLS only lets them write their own
// rows, and only name one of their own calendars to book into.
export async function saveSchedulingSettings(
  supabase: SupabaseClient,
  workspaceId: string,
  userId: string,
  settings: SchedulingSettings,
): Promise<void> {
  validate(settings);
  const now = new Date().toISOString();
  const { error: rulesError } = await supabase.from('scheduling_rules').upsert({
    workspace_id: workspaceId,
    user_id: userId,
    time_zone: settings.timeZone,
    working_days: [...new Set(settings.workingDays)].sort(),
    work_start: settings.workStart,
    work_end: settings.workEnd,
    default_duration_minutes: settings.defaultDurationMinutes,
    buffer_minutes: settings.bufferMinutes,
    min_notice_hours: settings.minNoticeHours,
    offer_count: settings.offerCount,
    prefer_calendly_link: settings.preferCalendlyLink,
    booking_calendar_account_id: settings.bookingCalendarAccountId,
    add_video_link: settings.addVideoLink,
    updated_at: now,
  });
  if (rulesError) throw rulesError;
  const { error: levelError } = await supabase
    .from('approval_settings')
    .upsert({ workspace_id: workspaceId, user_id: userId, level: settings.level, updated_at: now });
  if (levelError) throw levelError;
}
