// Deno Edge Function, intended to be invoked on a pg_cron schedule once that
// wiring lands. Duplicates the small query in
// src/server/events/processEventSignals.ts rather than importing it --
// Edge Functions run in Deno and don't share a bundle with the Next.js app.
import { createClient } from 'jsr:@supabase/supabase-js@2';

Deno.serve(async () => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  );

  const { data, error } = await supabase
    .from('event_signals')
    .update({ processed_at: new Date().toISOString() })
    .is('processed_at', null)
    .select('id');

  if (error) {
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }

  return new Response(JSON.stringify({ processed: data.length }), { status: 200 });
});
