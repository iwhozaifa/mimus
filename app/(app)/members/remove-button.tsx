'use client';

import { useState } from 'react';
import { removeMember } from './actions';

export function RemoveButton({ memberId }: { memberId: string }) {
  const [pending, setPending] = useState(false);

  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await removeMember(memberId);
        } finally {
          setPending(false);
        }
      }}
      className="rounded-md border border-red-200 px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      Remove
    </button>
  );
}
