'use client';

import { createClient } from '@/src/db/client';
import { useRouter } from 'next/navigation';

export function SignOutButton() {
  const router = useRouter();

  async function handleClick() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.refresh();
  }

  return <button onClick={handleClick}>Sign out</button>;
}
