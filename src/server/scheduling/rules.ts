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
