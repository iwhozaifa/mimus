'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { removeMember } from './actions';

export function RemoveButton({ memberId }: { memberId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="danger"
        size="sm"
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            await removeMember(memberId);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not remove member.');
          } finally {
            setPending(false);
          }
        }}
      >
        Remove
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
