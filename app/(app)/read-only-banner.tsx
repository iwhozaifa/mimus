export function ReadOnlyBanner({ isReadOnly }: { isReadOnly: boolean }) {
  if (!isReadOnly) {
    return null;
  }

  return (
    <div className="mb-6 rounded-md border border-danger/30 bg-danger-soft px-4 py-3 text-sm text-danger">
      This workspace is read-only because billing is past due or canceled. Writes are blocked until
      the subscription is resolved.
    </div>
  );
}
