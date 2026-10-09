import { createServiceClient } from '@/src/db/service';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// A workspace with an Owner and two Members, each able to sign in for a
// real user-scoped (RLS-enforced) client -- the client every agent tool
// runs under.
export interface FixtureUser {
  id: string;
  email: string;
  password: string;
}

export interface AgentFixture {
  workspaceId: string;
  owner: FixtureUser;
  alice: FixtureUser;
  bob: FixtureUser;
  connect(
    user: FixtureUser,
    provider: 'google' | 'slack',
    accountType: 'email' | 'calendar' | 'slack',
    visibility?: 'private' | 'team' | 'company',
  ): Promise<string>;
  signIn(user: FixtureUser): Promise<SupabaseClient>;
  cleanup(): Promise<void>;
}

export async function createAgentFixture(label: string): Promise<AgentFixture> {
  const service = createServiceClient();
  const makeUser = async (): Promise<FixtureUser> => {
    const id = randomUUID();
    const user = { id, email: `${id}@example.com`, password: `pw-${randomUUID()}` };
    const { error } = await service.auth.admin.createUser({ ...user, email_confirm: true });
    if (error) throw error;
    return user;
  };
  const [owner, alice, bob] = await Promise.all([makeUser(), makeUser(), makeUser()]);

  const { data: company } = await service
    .from('companies')
    .insert({ name: `${label} co` })
    .select('id')
    .single()
    .throwOnError();
  const { data: workspace } = await service
    .from('workspaces')
    .insert({ company_id: company!.id, name: `${label} ws` })
    .select('id')
    .single()
    .throwOnError();
  const workspaceId = workspace!.id as string;
  await service
    .from('workspace_members')
    .insert([
      { workspace_id: workspaceId, user_id: owner.id, role: 'owner' },
      { workspace_id: workspaceId, user_id: alice.id, role: 'member' },
      { workspace_id: workspaceId, user_id: bob.id, role: 'member' },
    ])
    .throwOnError();

  return {
    workspaceId,
    owner,
    alice,
    bob,
    async connect(user, provider, accountType, visibility = 'private') {
      const { data } = await service
        .from('connected_accounts')
        .insert({
          workspace_id: workspaceId,
          owner_user_id: user.id,
          provider,
          account_type: accountType,
          visibility,
          external_account_id: `${provider}-${accountType}-${user.id}`,
        })
        .select('id')
        .single()
        .throwOnError();
      return data!.id as string;
    },
    async signIn(user) {
      const client = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      );
      const { error } = await client.auth.signInWithPassword(user);
      if (error) throw error;
      return client;
    },
    async cleanup() {
      await service.from('companies').delete().eq('id', company!.id);
      await Promise.all([owner, alice, bob].map((user) => service.auth.admin.deleteUser(user.id)));
    },
  };
}
