import type { Proposal } from '@/src/server/scheduling/proposals';
import { formatSlot } from '@/src/server/scheduling/draftReply';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import Link from 'next/link';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { ProposalCard, type ProposalView } from './proposal-card';

const STATUS_LABELS: Record<string, string> = {
  draft_only: 'Draft only',
  pending: 'Waiting for you',
  offered: 'Times sent',
  executing: 'Sending…',
  booked: 'Booked',
  sent: 'Link sent',
  rejected: 'Dismissed',
};

const OPEN = new Set(['draft_only', 'pending', 'offered', 'executing']);

export default function ApprovalsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-ink">Approvals</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Scheduling replies Mimus has drafted for you. What Mimus may do without asking is set by
          your approval level in{' '}
          <Link href="/settings/scheduling" className="underline underline-offset-2">
            Scheduling settings
          </Link>
          .
        </p>
      </div>
      <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
        <ProposalList />
      </Suspense>
    </div>
  );
}

function toView(proposal: Proposal): ProposalView {
  return {
    id: proposal.id,
    subject: proposal.subject ?? '(no subject)',
    counterparts: proposal.counterpart_emails,
    kind: proposal.kind,
    status: proposal.status,
    statusLabel: STATUS_LABELS[proposal.status] ?? proposal.status,
    slots: proposal.slots.map((slot) => ({ ...slot, label: formatSlot(slot, proposal.time_zone) })),
    chosenSlotLabel: proposal.chosen_slot
      ? formatSlot(proposal.chosen_slot, proposal.time_zone)
      : null,
    draftBody: proposal.draft_body,
    note: proposal.error,
    sourceHref: `/sources/message/${proposal.source_message_id}`,
  };
}

async function ProposalList() {
  await connection();
  const context = await getCurrentWorkspaceContext();
  if (!context) {
    return (
      <Card>
        <Link href="/sign-in?next=/approvals" className="font-medium text-accent-strong">
          Sign in
        </Link>
      </Card>
    );
  }

  // The user's own proposals only -- RLS hides everyone else's, Owners
  // included.
  const { data } = await context.supabase
    .from('scheduling_proposals')
    .select('*')
    .eq('workspace_id', context.workspaceId)
    .order('created_at', { ascending: false })
    .limit(100);
  const proposals = (data ?? []) as Proposal[];
  const open = proposals.filter((p) => OPEN.has(p.status));
  const history = proposals.filter((p) => !OPEN.has(p.status));

  return (
    <>
      <section aria-label="Waiting for you" className="flex flex-col gap-4">
        {open.length ? (
          open.map((proposal) => <ProposalCard key={proposal.id} proposal={toView(proposal)} />)
        ) : (
          <Card>
            <p className="text-sm text-ink-muted">
              Nothing waiting. Open an email and choose Propose meeting times, or ask Mimus to reply
              to someone who wants to meet.
            </p>
          </Card>
        )}
      </section>
      {history.length > 0 && (
        <section aria-label="History" className="flex flex-col gap-4">
          <h2 className="text-lg font-semibold text-ink">History</h2>
          {history.map((proposal) => (
            <ProposalCard key={proposal.id} proposal={toView(proposal)} />
          ))}
        </section>
      )}
    </>
  );
}
