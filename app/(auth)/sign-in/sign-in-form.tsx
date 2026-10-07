'use client';

import { createClient } from '@/src/db/client';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';

export function SignInForm() {
  const searchParams = useSearchParams();
  const next = searchParams.get('next');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    // emailRedirectTo must exactly match an allow-listed redirect URL, so it
    // can't carry a dynamic `next` value as a query param -- stash it in a
    // short-lived cookie for the callback route to read instead.
    if (next) {
      document.cookie = `mimus-post-auth-redirect=${encodeURIComponent(next)}; max-age=600; path=/`;
    }

    const supabase = createClient();
    const { error: signInError } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
    });

    if (signInError) {
      setError(signInError.message);
      return;
    }
    setSent(true);
  }

  if (sent) {
    return <p className="text-sm text-slate-700">Check your email for a sign-in link.</p>;
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-slate-700">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-indigo-500 focus:outline-none focus:ring-1 focus:ring-indigo-500"
        />
      </div>
      <button
        type="submit"
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500"
      >
        Send magic link
      </button>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}
    </form>
  );
}
