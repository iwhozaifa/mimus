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
      ? 'bg-ink text-ink-foreground'
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
