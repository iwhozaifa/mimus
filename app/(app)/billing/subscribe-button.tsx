'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { startCheckout } from './actions';

export function SubscribeButton({ planId }: { planId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          try {
            const url = await startCheckout(planId);
            window.location.href = url;
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not start checkout.');
            setPending(false);
          }
        }}
      >
        Subscribe
      </Button>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
