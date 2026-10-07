'use client';

import type { WorkspaceRole } from '@/src/server/permissions/roles';
import { useState } from 'react';
import { changeMemberRole } from './actions';

export function RoleSelect({ memberId, role }: { memberId: string; role: 'manager' | 'member' }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <select
        defaultValue={role}
        disabled={pending}
        onChange={async (event) => {
          setPending(true);
          setError(null);
          try {
            await changeMemberRole(memberId, event.target.value as WorkspaceRole);
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Could not change role.');
          } finally {
            setPending(false);
          }
        }}
        className="rounded-md border border-line-muted px-2 py-1 text-sm text-ink disabled:opacity-50"
      >
        <option value="manager">Manager</option>
        <option value="member">Member</option>
      </select>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
