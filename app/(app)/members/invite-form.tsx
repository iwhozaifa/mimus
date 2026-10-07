'use client';

import type { WorkspaceRole } from '@/src/server/permissions/roles';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { inviteMember } from './actions';

export function InviteForm({ viewerRole }: { viewerRole: 'owner' | 'manager' }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-ink">Invite a teammate</h2>
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          setPending(true);
          setError(null);
          try {
            await inviteMember(email, role);
            setEmail('');
            setRole('member');
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not send invite.');
          } finally {
            setPending(false);
          }
        }}
        className="flex flex-wrap items-end gap-3"
      >
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-line-muted px-3 py-2 text-sm text-ink"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-ink-muted">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as WorkspaceRole)}
            className="rounded-md border border-line-muted px-3 py-2 text-sm text-ink"
          >
            {viewerRole === 'owner' && <option value="manager">Manager</option>}
            <option value="member">Member</option>
          </select>
        </label>
        <Button type="submit" disabled={pending}>
          Send invite
        </Button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-danger">
          {error}
        </p>
      )}
    </Card>
  );
}
