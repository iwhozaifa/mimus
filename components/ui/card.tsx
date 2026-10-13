export function Card({
  variant = 'default',
  showStatusDot = false,
  className = '',
  children,
}: {
  variant?: 'default' | 'dark';
  showStatusDot?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const base = 'rounded-card p-6';
  const tone =
    variant === 'dark'
      ? // A dark panel in light mode; in dark mode the page is already dark,
        // so it becomes a raised panel instead of turning light.
        'bg-ink text-ink-foreground dark:border dark:border-line-muted dark:bg-paper-raised dark:text-ink'
      : 'border border-line-muted bg-paper-raised text-ink';

  return (
    <div className={`${base} ${tone} ${className}`}>
      {showStatusDot && (
        <span className="mb-3 inline-flex items-center gap-2 text-sm text-accent">
          <span className="size-2 rounded-full bg-accent" />
        </span>
      )}
      {children}
    </div>
  );
}
