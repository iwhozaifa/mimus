export function Badge({
  variant = 'neutral',
  uppercase = false,
  className = '',
  children,
}: {
  variant?: 'neutral' | 'accent-soft' | 'danger-soft';
  uppercase?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  const tones: Record<string, string> = {
    neutral: 'bg-paper text-ink-muted',
    'accent-soft': 'bg-accent-soft text-accent-strong',
    'danger-soft': 'bg-danger-soft text-danger',
  };

  const shape = uppercase
    ? 'text-xs font-medium tracking-wide uppercase'
    : 'rounded-pill px-3 py-1 text-xs font-medium capitalize';

  return (
    <span
      className={`inline-flex items-center gap-1 ${uppercase ? '' : tones[variant]} ${shape} ${className}`}
    >
      {children}
    </span>
  );
}
