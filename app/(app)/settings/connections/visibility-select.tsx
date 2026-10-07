'use client';

import { updateConnectionVisibility } from './actions';

export function VisibilitySelect({
  accountId,
  visibility,
}: {
  accountId: string;
  visibility: 'private' | 'team' | 'company';
}) {
  return (
    <select
      defaultValue={visibility}
      onChange={(event) => {
        void updateConnectionVisibility(
          accountId,
          event.target.value as 'private' | 'team' | 'company',
        );
      }}
      className="rounded-md border border-slate-200 px-2 py-1 text-sm text-slate-700"
    >
      <option value="private">Private</option>
      <option value="team">Team</option>
      <option value="company">Company</option>
    </select>
  );
}
