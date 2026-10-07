'use client';

import type { WorkspaceRole } from '@/src/server/permissions/roles';
import { useState } from 'react';
import { changeMemberRole } from './actions';

export function RoleSelect({ memberId, role }: { memberId: string; role: 'manager' | 'member' }) {
  const [pending, setPending] = useState(false);

  return (
    <select
      defaultValue={role}
      disabled={pending}
      onChange={async (event) => {
        setPending(true);
        try {
          await changeMemberRole(memberId, event.target.value as WorkspaceRole);
        } finally {
          setPending(false);
        }
      }}
      className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700 disabled:opacity-50"
    >
      <option value="manager">Manager</option>
      <option value="member">Member</option>
    </select>
  );
}
