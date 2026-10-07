'use client';

import type { WorkspaceRole } from '@/src/server/permissions/roles';
import { useState } from 'react';
import { inviteMember } from './actions';

export function InviteForm({ viewerRole }: { viewerRole: 'owner' | 'manager' }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<WorkspaceRole>('member');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-4 text-lg font-semibold text-slate-900">Invite a teammate</h2>
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
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Email
          <input
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Role
          <select
            value={role}
            onChange={(event) => setRole(event.target.value as WorkspaceRole)}
            className="rounded-md border border-slate-200 px-3 py-2 text-sm"
          >
            {viewerRole === 'owner' && <option value="manager">Manager</option>}
            <option value="member">Member</option>
          </select>
        </label>
        <button
          type="submit"
          disabled={pending}
          className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-500 disabled:opacity-50"
        >
          Send invite
        </button>
      </form>
      {error && (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      )}
    </div>
  );
}
