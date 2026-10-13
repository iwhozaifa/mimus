import { runTool, type ToolContext } from '@/src/server/agent/tools';
import { upsertMessage } from '@/src/server/shared/normalize';
import { createServiceClient } from '@/src/db/service';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { createAgentFixture, type AgentFixture } from '../fixtures';

vi.mock('@/src/server/connectors/write', () => ({
  sendReply: vi.fn(async () => ({ providerMessageId: 'sent-1' })),
  createCalendarEvent: vi.fn(async () => ({ providerEventId: 'evt-1' })),
  WriteAccessError: class WriteAccessError extends Error {},
}));

import { sendReply } from '@/src/server/connectors/write';

describe('createSchedulingProposal tool (real local Supabase)', () => {
  let fx: AgentFixture;
  let alice: ToolContext;
  let messageId: string;
  let bobMessageId: string;

  beforeAll(async () => {
    fx = await createAgentFixture('Scheduling tool');
    const aliceEmail = await fx.connect(fx.alice, 'google', 'email');
    await fx.connect(fx.alice, 'google', 'calendar');
    const bobEmail = await fx.connect(fx.bob, 'google', 'email');
    await createServiceClient()
      .from('connected_accounts')
      .update({
        scopes: [
          'https://www.googleapis.com/auth/gmail.send',
          'https://www.googleapis.com/auth/calendar.events',
        ],
      })
      .eq('id', aliceEmail)
      .throwOnError();
    messageId = await upsertMessage(fx.workspaceId, aliceEmail, {
      providerMessageId: 'sched-1',
      subject: 'Intro call?',
      direction: 'inbound',
      sentAt: '2026-10-18T10:00:00Z',
      from: { email: 'sam@client.example', displayName: 'Sam' },
    });
    bobMessageId = await upsertMessage(fx.workspaceId, bobEmail, {
      providerMessageId: 'sched-2',
      subject: 'Bob only',
      direction: 'inbound',
      sentAt: '2026-10-18T10:00:00Z',
      from: { email: 'x@client.example' },
    });
    alice = {
      supabase: await fx.signIn(fx.alice),
      userId: fx.alice.id,
      workspaceId: fx.workspaceId,
      now: new Date('2026-10-19T08:00:00Z'),
    };
  });

  afterAll(async () => {
    await fx.cleanup();
  });

  it('drafts a proposal waiting in Approvals, citing the email, and sends nothing at level 2', async () => {
    const result = await runTool(
      ['createSchedulingProposal'],
      'createSchedulingProposal',
      { messageId },
      alice,
    );

    expect(result.isError).toBe(false);
    expect(result.data).toMatchObject({
      status: 'pending',
      kind: 'offer_times',
      approvalsUrl: '/approvals',
    });
    expect((result.data as { slots: unknown[] }).slots).toHaveLength(3);
    expect(result.sources).toEqual([
      expect.objectContaining({ kind: 'message', id: messageId, title: 'Intro call?' }),
    ]);
    expect(sendReply).not.toHaveBeenCalled();
  });

  it('returns an error result, not a proposal, for a message that isn’t the asker’s', async () => {
    const result = await runTool(
      ['createSchedulingProposal'],
      'createSchedulingProposal',
      { messageId: bobMessageId },
      alice,
    );
    expect(result.isError).toBe(true);
  });
});
