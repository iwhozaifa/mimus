import { createServiceClient } from '@/src/db/service';
import { getConnector, registerConnector } from '@/src/server/connectors/registry';
import { resumeUnfinishedBackfills } from '@/src/server/connectors/resumeBackfills';
import type { Connector } from '@/src/server/connectors/types';
import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Every run here pretends it's mid-2001, so only these rows -- not
// anything other test files or local dev data created -- are old enough
// to be picked up.
const NOW = new Date('2001-06-01T00:00:00Z');
const LONG_AGO = '2001-01-01T00:00:00Z';
const JUST_NOW = '2001-05-31T23:58:00Z';

describe('resumeUnfinishedBackfills', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];
  const backfill = vi.fn<(id: string) => Promise<void>>(async () => {});
  let realGoogle: Connector | undefined;

  beforeEach(() => {
    try {
      realGoogle = getConnector('google');
    } catch {
      realGoogle = undefined;
    }
    registerConnector({
      provider: 'google',
      capabilities: ['email', 'calendar'],
      getAuthUrl: async () => '',
      handleOAuthCallback: async () => [],
      backfill,
      handleWebhook: async () => new Response(null),
      poll: async () => {},
      refreshToken: async () => {},
      disconnect: async () => {},
    });
  });

  afterEach(async () => {
    backfill.mockReset();
    if (realGoogle) registerConnector(realGoogle);
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
    createdUserIds.length = 0;
  });

  async function makeAccounts(
    rows: { createdAt: string; status?: string; completed?: boolean }[],
  ): Promise<string[]> {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Resume test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Resume test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `resume-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);

    const { data } = await supabase
      .from('connected_accounts')
      .insert(
        rows.map((row, i) => ({
          workspace_id: workspace!.id,
          owner_user_id: userId,
          provider: 'google',
          account_type: i % 2 === 0 ? 'email' : 'calendar',
          external_account_id: `resume-${userId}-${i}@example.com`,
          status: row.status ?? 'connected',
          created_at: row.createdAt,
          backfill_completed_at: row.completed ? row.createdAt : null,
        })),
      )
      .select('id, external_account_id')
      .throwOnError();
    // Insert order isn't guaranteed back; map by the index in the address.
    return rows.map(
      (_, i) => data!.find((d) => d.external_account_id!.endsWith(`-${i}@example.com`))!.id,
    );
  }

  it('resumes only connected, unfinished imports that started long enough ago', async () => {
    const [unfinished, done, broken, fresh] = await makeAccounts([
      { createdAt: LONG_AGO },
      { createdAt: LONG_AGO, completed: true },
      { createdAt: LONG_AGO, status: 'needs_reauth' },
      { createdAt: JUST_NOW },
    ]);

    const result = await resumeUnfinishedBackfills({ limit: 50, now: NOW });

    const called = backfill.mock.calls.map(([id]) => id);
    expect(called).toEqual([unfinished]);
    expect(called).not.toContain(done);
    expect(called).not.toContain(broken);
    expect(called).not.toContain(fresh);
    expect(result).toEqual({ resumed: [unfinished], failed: [] });
  });

  it('stops at the per-run limit, oldest first', async () => {
    const [oldest, middle] = await makeAccounts([
      { createdAt: '2000-01-01T00:00:00Z' },
      { createdAt: '2000-01-02T00:00:00Z' },
      { createdAt: '2000-01-03T00:00:00Z' },
    ]);

    await resumeUnfinishedBackfills({ limit: 2, now: NOW });

    expect(backfill.mock.calls.map(([id]) => id)).toEqual([oldest, middle]);
  });

  it('keeps going when one account fails', async () => {
    const [first, second] = await makeAccounts([
      { createdAt: '2000-01-01T00:00:00Z' },
      { createdAt: '2000-01-02T00:00:00Z' },
    ]);
    backfill.mockImplementation(async (id: string) => {
      if (id === first) throw new Error('token revoked');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const result = await resumeUnfinishedBackfills({ limit: 2, now: NOW });

    expect(result.failed).toEqual([first]);
    expect(result.resumed).toEqual([second]);
  });
});
