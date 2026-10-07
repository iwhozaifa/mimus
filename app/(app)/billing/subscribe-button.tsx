'use client';

import { useState } from 'react';
import { startCheckout } from './actions';

export function SubscribeButton({ planId }: { planId: string }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <button
        type="button"
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
        className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
      >
        Subscribe
      </button>
      {error && (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
