import { createClient } from '@/src/db/server';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { SignOutButton } from './sign-out-button';

export default function Home() {
  return (
    <main>
      <Suspense fallback={<p>Loading…</p>}>
        <AuthStatus />
      </Suspense>
    </main>
  );
}

async function AuthStatus() {
  // Marks this as request-time rendering before getClaims() checks the JWT's
  // expiry against Date.now() -- otherwise Next's prerender analysis flags
  // that clock read as an unstable value, even inside this Suspense boundary.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const email = data?.claims.email as string | undefined;

  if (!email) {
    return <Link href="/sign-in">Sign in</Link>;
  }

  return (
    <>
      <p>Signed in as {email}</p>
      <SignOutButton />
    </>
  );
}
