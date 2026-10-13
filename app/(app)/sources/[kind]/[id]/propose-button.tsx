'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { proposeMeetingTimes } from '../../../approvals/actions';

export function ProposeButton({ messageId }: { messageId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={async () => {
            setPending(true);
            setError(null);
            try {
              // Only returns on failure; success goes to Approvals.
              const result = await proposeMeetingTimes(messageId);
              setError(result.error);
            } catch {
              setError('Couldn’t draft a reply. Try again.');
            } finally {
              setPending(false);
            }
          }}
        >
          {pending ? 'Finding times…' : 'Propose meeting times'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
