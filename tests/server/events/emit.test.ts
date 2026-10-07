import { createServiceClient } from '@/src/db/service';
import { emitSignal } from '@/src/server/events/emit';
import { processEventSignals } from '@/src/server/events/processEventSignals';
import { describe, expect, it } from 'vitest';

describe('event signals', () => {
  const supabase = createServiceClient();

  async function makeWorkspace() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Signal test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Signal test ws' })
      .select('id')
      .single()
      .throwOnError();
    return workspace!.id as string;
  }

  it('emitSignal writes an unprocessed row', async () => {
    const workspaceId = await makeWorkspace();
    const id = await emitSignal(workspaceId, 'message.received', { foo: 'bar' });

    const { data: row } = await supabase
      .from('event_signals')
      .select('type, payload, processed_at')
      .eq('id', id)
      .single();

    expect(row?.type).toBe('message.received');
    expect(row?.payload).toEqual({ foo: 'bar' });
    expect(row?.processed_at).toBeNull();
  });

  it('processEventSignals marks pending signals processed', async () => {
    const workspaceId = await makeWorkspace();
    const id = await emitSignal(workspaceId, 'event.created', { baz: 1 });

    const count = await processEventSignals();
    expect(count).toBeGreaterThanOrEqual(1);

    const { data: row } = await supabase
      .from('event_signals')
      .select('processed_at')
      .eq('id', id)
      .single();
    expect(row?.processed_at).not.toBeNull();
  });
});
