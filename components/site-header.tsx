import Link from 'next/link';
import type { ReactNode } from 'react';
import { MimusLogo } from '@/components/brand/logo';
import { ThemeToggle } from '@/components/theme-toggle';

// The public header: logo home, optional page links, theme toggle, and
// whatever account action the page provides (Sign in by default).
export function SiteHeader({
  width = 'max-w-3xl',
  nav,
  action,
}: {
  width?: string;
  nav?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <header className="border-b border-line-muted bg-paper-raised/80 backdrop-blur">
      <div className={`mx-auto flex ${width} items-center justify-between gap-4 px-6 py-3`}>
        <Link href="/" aria-label="Mimus home" className="text-ink">
          <MimusLogo className="h-[34px] w-auto" />
        </Link>
        {nav}
        <div className="flex items-center gap-2">
          <ThemeToggle />
          {action ?? (
            <Link
              href="/sign-in"
              className="rounded-md px-3 py-1.5 text-sm font-medium text-accent-strong hover:text-accent"
            >
              Sign in
            </Link>
          )}
        </div>
      </div>
    </header>
  );
}
