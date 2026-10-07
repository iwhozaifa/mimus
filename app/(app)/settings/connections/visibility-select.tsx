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
      className="rounded-md border border-line-muted px-2 py-1 text-sm text-ink"
    >
      <option value="private">Private</option>
      <option value="team">Team</option>
      <option value="company">Company</option>
    </select>
  );
}
