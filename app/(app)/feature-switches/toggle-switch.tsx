'use client';

import { useState } from 'react';
import { setFeatureSwitch } from './actions';

export function ToggleSwitch({
  label,
  feKey,
  enabled,
}: {
  label: string;
  feKey: string;
  enabled: boolean;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <label className="flex items-center gap-2 text-sm text-ink-muted">
        <input
          type="checkbox"
          defaultChecked={enabled}
          disabled={pending}
          aria-label={label}
          onChange={async (event) => {
            const next = event.target.checked;
            setPending(true);
            setError(null);
            try {
              await setFeatureSwitch(feKey, next);
            } catch (err) {
              setError(err instanceof Error ? err.message : 'Could not update this switch.');
              event.target.checked = !next;
            } finally {
              setPending(false);
            }
          }}
          className="h-4 w-4 rounded border-line-muted text-accent accent-[var(--color-accent)] disabled:opacity-50"
        />
      </label>
      {error && (
        <p role="alert" className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
