'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { decide } from './actions';

export interface ProposalView {
  id: string;
  subject: string;
  counterparts: string[];
  kind: 'offer_times' | 'calendly_link';
  status: string;
  statusLabel: string;
  slots: Array<{ start: string; end: string; label: string }>;
  chosenSlotLabel: string | null;
  draftBody: string;
  note: string | null;
  sourceHref: string;
}

type Decision = Parameters<typeof decide>[1];

export function ProposalCard({ proposal }: { proposal: ProposalView }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [slotIndex, setSlotIndex] = useState(0);

  const open = ['draft_only', 'pending', 'offered'].includes(proposal.status);
  const canBook =
    proposal.kind === 'offer_times' && ['pending', 'offered'].includes(proposal.status);

  async function run(decision: Decision) {
    setPending(true);
    setError(null);
    try {
      const result = await decide(proposal.id, decision);
      setError(result.error);
      router.refresh();
    } catch {
      setError('Something went wrong. Try again.');
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <article aria-label={proposal.subject} className="flex flex-col gap-4">
        <header className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <a
              href={proposal.sourceHref}
              className="font-medium break-words text-ink hover:underline"
            >
              {proposal.subject}
            </a>
            <p className="text-sm break-all text-ink-muted">
              To {proposal.counterparts.join(', ')}
            </p>
          </div>
          <Badge variant={proposal.status === 'pending' ? 'accent-soft' : 'neutral'}>
            {proposal.statusLabel}
          </Badge>
        </header>

        {proposal.chosenSlotLabel && (
          <p className="text-sm text-ink">Booked for {proposal.chosenSlotLabel}</p>
        )}

        <pre className="rounded-md bg-paper p-4 font-sans text-sm whitespace-pre-wrap text-ink">
          {proposal.draftBody}
        </pre>

        {proposal.note && <p className="text-sm text-ink-muted">{proposal.note}</p>}

        {open && (
          <div className="flex flex-col gap-3">
            {canBook && (
              <fieldset className="flex flex-col gap-2">
                <legend className="mb-1 text-sm font-medium text-ink">
                  {proposal.status === 'offered' ? 'When they pick a time' : 'Or book one now'}
                </legend>
                {proposal.slots.map((slot, index) => (
                  <label key={slot.start} className="flex items-center gap-2 text-sm text-ink">
                    <input
                      type="radio"
                      name={`slot-${proposal.id}`}
                      checked={slotIndex === index}
                      onChange={() => setSlotIndex(index)}
                    />
                    {slot.label}
                  </label>
                ))}
              </fieldset>
            )}
            <div className="flex flex-wrap gap-2">
              {proposal.status === 'pending' && proposal.kind === 'offer_times' && (
                <Button disabled={pending} onClick={() => run({ action: 'send_offer' })}>
                  Send these times
                </Button>
              )}
              {proposal.status === 'pending' && proposal.kind === 'calendly_link' && (
                <Button disabled={pending} onClick={() => run({ action: 'send_link' })}>
                  Send the link
                </Button>
              )}
              {canBook && (
                <Button
                  variant="outline"
                  disabled={pending}
                  onClick={() => {
                    const { start, end } = proposal.slots[slotIndex];
                    run({ action: 'book', slot: { start, end } });
                  }}
                >
                  Book this time
                </Button>
              )}
              {proposal.status === 'draft_only' && (
                <Button
                  variant="outline"
                  onClick={async () => {
                    await navigator.clipboard.writeText(proposal.draftBody);
                    setCopied(true);
                  }}
                >
                  {copied ? 'Copied' : 'Copy draft'}
                </Button>
              )}
              <Button variant="ghost" disabled={pending} onClick={() => run({ action: 'reject' })}>
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
      </article>
    </Card>
  );
}
