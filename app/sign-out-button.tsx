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
      className="rounded-md border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
    >
      Sign out
    </button>
  );
}
