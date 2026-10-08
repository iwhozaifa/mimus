import { createServiceClient } from '@/src/db/service';
import { upsertEvent, upsertMessage, upsertPerson } from '@/src/server/shared/normalize';
import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';

describe('shared normalize/upsert helpers', () => {
  const supabase = createServiceClient();
  const createdUserIds: string[] = [];

  afterAll(async () => {
    await Promise.all(createdUserIds.map((id) => supabase.auth.admin.deleteUser(id)));
  });

  async function makeFixture() {
    const { data: company } = await supabase
      .from('companies')
      .insert({ name: 'Normalize test co' })
      .select('id')
      .single()
      .throwOnError();
    const { data: workspace } = await supabase
      .from('workspaces')
      .insert({ company_id: company!.id, name: 'Normalize test ws' })
      .select('id')
      .single()
      .throwOnError();
    const userId = randomUUID();
    const { error } = await supabase.auth.admin.createUser({
      id: userId,
      email: `normalize-${userId}@example.com`,
      email_confirm: true,
    });
    if (error) throw error;
    createdUserIds.push(userId);
    const { data: account } = await supabase
      .from('connected_accounts')
      .insert({
        workspace_id: workspace!.id,
        owner_user_id: userId,
        provider: 'google',
        account_type: 'email',
      })
      .select('id')
      .single()
      .throwOnError();
    return { workspaceId: workspace!.id as string, connectedAccountId: account!.id as string };
  }

  it('upsertPerson dedupes by (connected_account_id, email)', async () => {
    const { workspaceId, connectedAccountId } = await makeFixture();
    const id1 = await upsertPerson(workspaceId, connectedAccountId, {
      email: 'Contact@Example.com',
      displayName: 'A Contact',
    });
    const id2 = await upsertPerson(workspaceId, connectedAccountId, {
      email: 'contact@example.com',
      displayName: 'A Contact (updated)',
    });
    expect(id2).toBe(id1);

    const { data } = await supabase.from('people').select('display_name').eq('id', id1).single();
    expect(data?.display_name).toBe('A Contact (updated)');
  });

  it('upsertMessage inserts a normalized message and emits exactly one signal, idempotently', async () => {
    const { workspaceId, connectedAccountId } = await makeFixture();

    const messageId = await upsertMessage(workspaceId, connectedAccountId, {
      providerMessageId: 'gmail-abc-123',
      subject: 'Hello',
      direction: 'inbound',
      from: { email: 'sender@example.com', displayName: 'Sender' },
      participants: [{ person: { email: 'recipient@example.com' }, role: 'to' }],
    });

    const { data: message } = await supabase
      .from('messages')
      .select('subject, direction')
      .eq('id', messageId)
      .single();
    expect(message?.subject).toBe('Hello');

    const { data: participants } = await supabase
      .from('message_participants')
      .select('role')
      .eq('message_id', messageId);
    expect(participants).toHaveLength(1);

    const { data: signalsAfterFirst } = await supabase
      .from('event_signals')
      .select('id')
      .eq('source_connected_account_id', connectedAccountId)
      .eq('type', 'message.received');
    expect(signalsAfterFirst).toHaveLength(1);

    // Re-running backfill with the same provider id upserts, not duplicates.
    const messageIdAgain = await upsertMessage(workspaceId, connectedAccountId, {
      providerMessageId: 'gmail-abc-123',
      subject: 'Hello (re-synced)',
      direction: 'inbound',
    });
    expect(messageIdAgain).toBe(messageId);

    const { data: messagesAfter } = await supabase
      .from('messages')
      .select('id')
      .eq('connected_account_id', connectedAccountId);
    expect(messagesAfter).toHaveLength(1);

    const { data: signalsAfterSecond } = await supabase
      .from('event_signals')
      .select('id')
      .eq('source_connected_account_id', connectedAccountId)
      .eq('type', 'message.received');
    expect(signalsAfterSecond).toHaveLength(1);
  });

  it('upsertEvent inserts a normalized event idempotently', async () => {
    const { workspaceId, connectedAccountId } = await makeFixture();

    const startsAt = new Date().toISOString();
    const endsAt = new Date(Date.now() + 30 * 60 * 1000).toISOString();

    const eventId = await upsertEvent(workspaceId, connectedAccountId, {
      providerEventId: 'gcal-xyz-456',
      title: 'Sync',
      startsAt,
      endsAt,
      attendees: [{ person: { email: 'attendee@example.com' }, responseStatus: 'accepted' }],
    });

    const eventIdAgain = await upsertEvent(workspaceId, connectedAccountId, {
      providerEventId: 'gcal-xyz-456',
      title: 'Sync (renamed)',
      startsAt,
      endsAt,
    });
    expect(eventIdAgain).toBe(eventId);

    const { data: eventsAfter } = await supabase
      .from('events')
      .select('id, title')
      .eq('connected_account_id', connectedAccountId);
    expect(eventsAfter).toHaveLength(1);
    expect(eventsAfter?.[0].title).toBe('Sync (renamed)');
  });
});
