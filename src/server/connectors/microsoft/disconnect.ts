import { createServiceClient } from '@/src/db/service';

// Microsoft Graph/Entra expose no per-app token revocation API analogous to
// Google's OAuth2Client.revokeToken(). The closest equivalent --
// POST /me/revokeSignInSessions -- invalidates the user's refresh tokens
// for *every* app they've consented to, not just this one (confirmed
// against Microsoft Learn's current docs for that API), so calling it here
// would sign the user out of every other Microsoft app too, which is far
// too broad a side effect for disconnecting one connection. The only thing
// actually within this connector's control is deleting our own cached MSAL
// token cache below -- the user's underlying Microsoft refresh token stays
// valid at Microsoft's end until it naturally expires or the user/admin
// revokes it themselves outside Mimus.
//
// Each sibling connected_accounts row (email + calendar, see connect.ts)
// holds its own independent copy of the same underlying cache, so purging
// one sibling's content/secret rows -- same as Google -- leaves the
// other's access and data untouched.
export async function disconnectMicrosoftAccount(connectedAccountId: string): Promise<void> {
  const supabase = createServiceClient();

  await supabase
    .from('connected_accounts')
    .update({ status: 'disconnected', disconnected_at: new Date().toISOString() })
    .eq('id', connectedAccountId)
    .throwOnError();

  await Promise.all([
    supabase
      .from('messages')
      .delete()
      .eq('connected_account_id', connectedAccountId)
      .throwOnError(),
    supabase.from('events').delete().eq('connected_account_id', connectedAccountId).throwOnError(),
    supabase.from('people').delete().eq('connected_account_id', connectedAccountId).throwOnError(),
    supabase
      .from('connected_account_secrets')
      .delete()
      .eq('connected_account_id', connectedAccountId)
      .throwOnError(),
  ]);
}
