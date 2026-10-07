export function Avatar({ initials, size = 'md' }: { initials: string; size?: 'sm' | 'md' }) {
  const dims = size === 'sm' ? 'size-8 text-xs' : 'size-9 text-sm';

  return (
    <span
      className={`inline-flex items-center justify-center rounded-full bg-accent-soft font-semibold text-ink ${dims}`}
    >
      {initials}
    </span>
  );
}
