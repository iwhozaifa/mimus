import { SiteFooter } from '@/components/site-footer';
import { SiteHeader } from '@/components/site-header';

// Public pages (policies, deletion instructions): no auth, no workspace
// lookup, so each renders entirely into the static shell.
export default function LegalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <SiteHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-10">{children}</main>
      <SiteFooter />
    </div>
  );
}
