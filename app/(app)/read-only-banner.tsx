export function ReadOnlyBanner({ isReadOnly }: { isReadOnly: boolean }) {
  if (!isReadOnly) {
    return null;
  }

  return (
    <div className="mb-6 rounded-md border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-800">
      This workspace is read-only because billing is past due or canceled. Writes are blocked until
      the subscription is resolved.
    </div>
  );
}
