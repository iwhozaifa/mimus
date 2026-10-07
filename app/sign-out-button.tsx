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

  return (
    <button
      onClick={handleClick}
      className="w-full rounded-md px-3 py-2 text-left text-sm font-medium text-ink-muted hover:bg-paper hover:text-ink"
    >
      Sign out
    </button>
  );
}
