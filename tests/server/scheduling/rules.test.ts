import {
  DEFAULT_SCHEDULING_RULES,
  loadApprovalLevel,
  loadSchedulingRules,
} from '@/src/server/scheduling/rules';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createAgentFixture, type AgentFixture } from '../agent/fixtures';

describe('scheduling rules and approval level (real local Supabase)', () => {
  let fx: AgentFixture;

  beforeAll(async () => {
    fx = await createAgentFixture('Scheduling rules');
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it('falls back to the defaults, with approval level 2, before anything is saved', async () => {
    const alice = await fx.signIn(fx.alice);
    expect(await loadSchedulingRules(alice, fx.workspaceId, fx.alice.id)).toEqual(
      DEFAULT_SCHEDULING_RULES,
    );
    expect(await loadApprovalLevel(alice, fx.workspaceId, fx.alice.id)).toBe(2);
  });

  it('reads the user’s own saved rules and level', async () => {
    const alice = await fx.signIn(fx.alice);
    await alice
      .from('scheduling_rules')
      .insert({
        workspace_id: fx.workspaceId,
        user_id: fx.alice.id,
        time_zone: 'Europe/London',
        working_days: [1, 2, 3],
        work_start: '08:30',
        work_end: '16:00',
        offer_count: 2,
        prefer_calendly_link: true,
      })
      .throwOnError();
    await alice
      .from('approval_settings')
      .insert({ workspace_id: fx.workspaceId, user_id: fx.alice.id, level: 3 })
      .throwOnError();

    expect(await loadSchedulingRules(alice, fx.workspaceId, fx.alice.id)).toEqual({
      ...DEFAULT_SCHEDULING_RULES,
      timeZone: 'Europe/London',
      workingDays: [1, 2, 3],
      workStart: '08:30',
      workEnd: '16:00',
      offerCount: 2,
      preferCalendlyLink: true,
    });
    expect(await loadApprovalLevel(alice, fx.workspaceId, fx.alice.id)).toBe(3);
  });
});
