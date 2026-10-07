import { createServiceClient } from '@/src/db/service';

// Scaffold only: marks pending signals processed. No listener modules exist
// yet to fan out to -- those land as connectors and agent modules are built
// in later milestones. The Edge Function at
// supabase/functions/process-event-signals wraps this same query on its own
// Deno-side client, since Edge Functions don't share a bundle with the app.
export async function processEventSignals(): Promise<number> {
  const supabase = createServiceClient();
  const { data, error } = await supabase
    .from('event_signals')
    .update({ processed_at: new Date().toISOString() })
    .is('processed_at', null)
    .select('id');

  if (error) throw error;
  return data.length;
}
