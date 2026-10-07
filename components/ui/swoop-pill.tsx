import Link from 'next/link';
import { ArrowDown, ArrowUp } from 'lucide-react';

type SwoopPillProps = {
  direction: 'down' | 'up';
  tone?: 'ink' | 'accent';
  href?: string;
  onClick?: () => void;
  type?: 'button' | 'submit';
  className?: string;
  children: React.ReactNode;
};

export function SwoopPill({
  direction,
  tone = 'ink',
  href,
  onClick,
  type = 'button',
  className = '',
  children,
}: SwoopPillProps) {
  const Icon = direction === 'down' ? ArrowDown : ArrowUp;
  const toneClasses =
    tone === 'accent'
      ? 'bg-accent text-accent-foreground hover:bg-accent-strong'
      : 'bg-ink text-ink-foreground hover:bg-ink/90';
  const classes = `inline-flex items-center gap-1 rounded-pill px-3 py-1.5 text-sm font-medium transition-colors ${toneClasses} ${className}`;

  if (href) {
    return (
      <Link href={href} className={classes}>
        {children}
        <Icon className="size-3.5" />
      </Link>
    );
  }

  return (
    <button type={type} onClick={onClick} className={classes}>
      {children}
      <Icon className="size-3.5" />
    </button>
  );
}
