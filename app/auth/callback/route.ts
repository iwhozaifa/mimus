import { createClient } from '@/src/db/server';
import { createWorkspaceForNewUser } from '@/src/server/workspaces/createWorkspace';
import { redirect } from 'next/navigation';
import { type NextRequest } from 'next/server';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const next =
    searchParams.get('next') ?? request.cookies.get('mimus-post-auth-redirect')?.value ?? '/';

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error && data.user.email) {
      await createWorkspaceForNewUser(data.user.id, data.user.email);
      redirect(next);
    }
  }

  redirect('/sign-in?error=auth');
}
