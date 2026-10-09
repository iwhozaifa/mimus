import { createServiceClient } from '@/src/db/service';
import { loadWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

describe('loadWorkspaceContext', () => {
  const service = createServiceClient();
  const userId = randomUUID();
  const email = `${userId}@example.com`;
  const password = `pw-${randomUUID()}`;
  let workspaceId: string;
  let companyId: string;

  beforeAll(async () => {
    const { error } = await service.auth.admin.createUser({
      id: userId,
      email,
      password,
      email_confirm: true,
    });
    if (error) throw error;

    await service
      .from('profiles')
      .insert({ id: userId, email, full_name: 'Ada Lovelace' })
      .throwOnError();

    const { data: company } = await service
      .from('companies')
      .insert({ name: 'Context test co' })
      .select('id')
      .single()
      .throwOnError();
    companyId = company!.id;
    const { data: workspace } = await service
      .from('workspaces')
      .insert({ company_id: companyId, name: 'Context test ws' })
      .select('id')
      .single()
      .throwOnError();
    workspaceId = workspace!.id;

    await service
      .from('workspace_members')
      .insert({ workspace_id: workspaceId, user_id: userId, role: 'manager' })
      .throwOnError();
  });

  afterAll(async () => {
    await service.from('companies').delete().eq('id', companyId);
    await service.auth.admin.deleteUser(userId);
  });

  function anonClient() {
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    );
  }

  it('returns membership, workspace name and profile name for a signed-in user', async () => {
    const supabase = anonClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;

    const context = await loadWorkspaceContext(supabase);

    expect(context).toMatchObject({
      userId,
      email,
      fullName: 'Ada Lovelace',
      workspaceId,
      workspaceName: 'Context test ws',
      role: 'manager',
    });
    expect(context?.supabase).toBe(supabase);
  });

  it('returns null without a session', async () => {
    await expect(loadWorkspaceContext(anonClient())).resolves.toBeNull();
  });
});
