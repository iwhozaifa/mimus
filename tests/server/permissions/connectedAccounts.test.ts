import { createServiceClient } from '@/src/db/service';
import { canSeeConnectedAccount } from '@/src/server/permissions/connectedAccounts';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('permission engine: connected accounts', () => {
  const supabase = createServiceClient();
  const ownerId = randomUUID();
  const outsiderId = randomUUID();
  let connectedAccountId: string;

  beforeAll(async () => {
    for (const id of [ownerId, outsiderId]) {
      const { error } = await supabase.auth.admin.createUser({
        id,
        email: `${id}@example.com`,
        email_confirm: true,
      });
      if (error) throw error;
    }

    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'CA test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'CA test ws' })
      .select('id')
      .single()
      .throwOnError();

    await supabase
      .from('workspace_members')
      .insert([
        { workspace_id: workspace!.id, user_id: ownerId, role: 'owner' },
        { workspace_id: workspace!.id, user_id: outsiderId, role: 'member' },
      ])
      .throwOnError();

    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: ownerId,
        provider: 'google',
        account_type: 'email',
        visibility: 'private',
      })
      .select('id')
      .single()
      .throwOnError();
    connectedAccountId = account!.id;
  });

  afterAll(async () => {
    await supabase.auth.admin.deleteUser(ownerId);
    await supabase.auth.admin.deleteUser(outsiderId);
  });

  it('matches the SQL function it wraps', async () => {
    await expect(canSeeConnectedAccount(ownerId, connectedAccountId)).resolves.toBe(true);
    await expect(canSeeConnectedAccount(outsiderId, connectedAccountId)).resolves.toBe(false);
  });
});
