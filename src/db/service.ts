import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Service-role client for system writes only (e.g. provisioning a new
// user's first workspace before they have any RLS-granted access of their
// own). Never use this for AI content reads -- see the implementation plan's
// RLS strategy.
export function createServiceClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
}
