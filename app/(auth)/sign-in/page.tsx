'use client';

import { createClient } from '@/src/db/client';
import { useState } from 'react';

export default function SignInPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

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
