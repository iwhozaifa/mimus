import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

// Always create a new client per request/function call rather than caching
// one in a module-level variable -- with Fluid compute, a cached client can
// leak cookies/session state across unrelated requests.
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies can't be
            // written -- fine as long as proxy.ts refreshes the session.
          }
        },
      },
    },
  );
}
