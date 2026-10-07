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
    return <p>Check your email for a sign-in link.</p>;
  }

  return (
    <form onSubmit={handleSubmit}>
      <label htmlFor="email">Email</label>
      <input
        id="email"
        name="email"
        type="email"
        required
        value={email}
        onChange={(event) => setEmail(event.target.value)}
      />
      <button type="submit">Send magic link</button>
      {error && <p role="alert">{error}</p>}
    </form>
  );
}
