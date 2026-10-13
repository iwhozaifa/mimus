import Link from 'next/link';
import { SiteFooter } from '@/components/site-footer';

// Public pages (policies, deletion instructions): no auth, no workspace
// lookup, so each renders entirely into the static shell.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <header className="border-b border-line-muted bg-paper-raised">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-4">
          <Link href="/" className="text-lg font-semibold text-ink">
            Mimus
          </Link>
          <Link
            href="/sign-in"
            className="text-sm font-medium text-accent-strong hover:text-accent"
          >
            Sign in
          </Link>
        </div>
      </header>
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
      <SiteFooter />
    </div>
  );
}
