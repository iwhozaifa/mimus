'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { deleteMyAccount } from './actions';

export function DeleteAccountForm({ disabled }: { disabled: boolean }) {
  const [confirmation, setConfirmation] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const confirmed = confirmation.trim().toLowerCase() === 'delete';

  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={async (event) => {
        event.preventDefault();
        setPending(true);
        setError(null);
        try {
          // Only returns on failure; success redirects away.
          const result = await deleteMyAccount(confirmation);
          setError(result.error);
        } catch {
          setError("Couldn't delete your account. Try again, or contact us.");
        } finally {
          setPending(false);
        }
      }}
    >
      <label htmlFor="delete-confirmation" className="text-sm text-ink-muted">
        Type <span className="font-mono font-medium text-ink">delete</span> to confirm
      </label>
      <input
        id="delete-confirmation"
        value={confirmation}
        onChange={(event) => setConfirmation(event.target.value)}
        disabled={disabled || pending}
        autoComplete="off"
        className="w-full max-w-xs rounded-md border border-line-muted px-3 py-2 text-sm text-ink disabled:opacity-50"
      />
      <div>
        <Button type="submit" variant="danger" disabled={disabled || pending || !confirmed}>
          {pending ? 'Deleting…' : 'Delete my account'}
        </Button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}
