import {
  DEFAULT_SCHEDULING_RULES,
  loadApprovalLevel,
  loadSchedulingRules,
  saveSchedulingSettings,
  SettingsError,
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

  it('saves settings through the user’s own session, validating them first', async () => {
    const bob = await fx.signIn(fx.bob);
    await saveSchedulingSettings(bob, fx.workspaceId, fx.bob.id, {
      ...DEFAULT_SCHEDULING_RULES,
      timeZone: 'America/New_York',
      workStart: '08:00',
      workEnd: '12:30',
      level: 4,
    });
    expect(await loadSchedulingRules(bob, fx.workspaceId, fx.bob.id)).toMatchObject({
      timeZone: 'America/New_York',
      workStart: '08:00',
      workEnd: '12:30',
    });
    expect(await loadApprovalLevel(bob, fx.workspaceId, fx.bob.id)).toBe(4);

    const invalid = [
      { timeZone: 'Mars/Olympus' },
      { workStart: '18:00', workEnd: '09:00' },
      { workingDays: [] },
      { level: 7 },
      { offerCount: 5 },
    ];
    for (const change of invalid) {
      await expect(
        saveSchedulingSettings(bob, fx.workspaceId, fx.bob.id, {
          ...DEFAULT_SCHEDULING_RULES,
          level: 2,
          ...change,
        } as never),
      ).rejects.toBeInstanceOf(SettingsError);
    }
  });
});
