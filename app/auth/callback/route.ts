import { createClient } from '@/src/db/server';
import { createWorkspaceForNewUser } from '@/src/server/workspaces/createWorkspace';
import { type EmailOtpType } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const tokenHash = searchParams.get('token_hash');
  const type = searchParams.get('type') as EmailOtpType | null;
  const next =
    searchParams.get('next') ?? request.cookies.get('mimus-post-auth-redirect')?.value ?? '/';

  const supabase = await createClient();

  // The real sign-in UI uses PKCE (a `code` param); admin-generated links
  // (used in the staging smoke test, since there's no inbox to poll) don't
  // go through PKCE at all and arrive as a token_hash/type pair instead.
  const { data, error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && type
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
      : { data: { user: null }, error: new Error('Missing code or token_hash') };

  if (!error && data.user?.email) {
    await createWorkspaceForNewUser(data.user.id, data.user.email);
    redirect(next);
  }

  redirect('/sign-in?error=auth');
}
