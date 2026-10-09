import { createServiceClient } from '@/src/db/service';
import { listVisibleSlackMessages } from '@/src/server/connectors/slack/tool';
import { upsertMessage } from '@/src/server/shared/normalize';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('listVisibleSlackMessages', () => {
  const supabase = createServiceClient();
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  const password = `pw-${randomUUID()}`;
  let workspaceId: string;
  let ownerAccountId: string;
  let outsiderPrivateAccountId: string;

  beforeAll(async () => {
    for (const id of [ownerId, outsiderId]) {
      const { error } = await supabase.auth.admin.createUser({
        id,
        email: `${id}@example.com`,
        password,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Slack tool test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Slack tool test ws' })
      .select('id')
      .single()
      .throwOnError();
    workspaceId = workspace!.id as string;

    await supabase
      .from('workspace_members')
      .insert([
        { workspace_id: workspaceId, user_id: ownerId, role: 'member' },
        { workspace_id: workspaceId, user_id: outsiderId, role: 'member' },
      ])
      .throwOnError();

    const { data: ownerAccount } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspaceId,
        owner_user_id: ownerId,
        provider: 'slack',
        account_type: 'slack',
        visibility: 'private',
        external_account_id: 'U_OWNER',
      })
      .select('id')
      .single()
      .throwOnError();
    ownerAccountId = ownerAccount!.id as string;

    const { data: outsiderAccount } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspaceId,
        owner_user_id: outsiderId,
        provider: 'slack',
        account_type: 'slack',
        visibility: 'private',
        external_account_id: 'U_OUTSIDER',
      })
      .select('id')
      .single()
      .throwOnError();
    outsiderPrivateAccountId = outsiderAccount!.id as string;

    await upsertMessage(workspaceId, ownerAccountId, {
      providerMessageId: 'C1:1700000000.000100',
      bodyText: 'owner can see this',
      direction: 'inbound',
      sentAt: new Date('2024-01-01').toISOString(),
    });
    await upsertMessage(workspaceId, outsiderPrivateAccountId, {
      providerMessageId: 'C2:1700000001.000100',
      bodyText: "outsider's private message",
      direction: 'inbound',
      sentAt: new Date('2024-01-02').toISOString(),
    });
  });

  // Tools run under the asker's own session, never the service role.
  async function signedIn(userId: string) {
    const client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
    const { error } = await client.auth.signInWithPassword({
      email: `${userId}@example.com`,
      password,
    });
    if (error) throw error;
    return client;
  }

  afterAll(async () => {
    await supabase.auth.admin.deleteUser(ownerId);
    await supabase.auth.admin.deleteUser(outsiderId);
  });

  it("returns only the asker's own private Slack messages, never another member's", async () => {
    const results = await listVisibleSlackMessages({
      supabase: await signedIn(ownerId),
      askerUserId: ownerId,
      workspaceId,
    });

    expect(results).toHaveLength(1);
    expect(results[0].bodyText).toBe('owner can see this');
    expect(results[0].connectedAccountId).toBe(ownerAccountId);
  });

  it('returns an empty list for a workspace member with no visible Slack accounts of their own', async () => {
    const thirdPartyId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: thirdPartyId,
      email: `${thirdPartyId}@example.com`,
      password,
      email_confirm: true,
    });
    if (error) throw error;
    await supabase
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: thirdPartyId, role: 'member' })
      .throwOnError();

    const results = await listVisibleSlackMessages({
      supabase: await signedIn(thirdPartyId),
      askerUserId: thirdPartyId,
      workspaceId,
    });
    expect(results).toEqual([]);

    await supabase.auth.admin.deleteUser(thirdPartyId);
  });

  it('filters by keyword', async () => {
    const supabaseAsOwner = await signedIn(ownerId);
    const hit = await listVisibleSlackMessages({
      supabase: supabaseAsOwner,
      askerUserId: ownerId,
      workspaceId,
      query: 'owner',
    });
    const miss = await listVisibleSlackMessages({
      supabase: supabaseAsOwner,
      askerUserId: ownerId,
      workspaceId,
      query: 'nonexistent',
    });
    expect(hit).toHaveLength(1);
    expect(miss).toEqual([]);
  });
});
