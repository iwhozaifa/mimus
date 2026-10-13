import Link from 'next/link';
import { MimusLogo } from '@/components/brand/logo';

const LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/account-deletion', label: 'Delete your account' },
];

// The public footer. Google's OAuth verification checks that the homepage
// links to the same Privacy Policy URL as the consent screen, so every
// public page carries it.
export function SiteFooter({ width = 'max-w-3xl' }: { width?: string }) {
  return (
    <footer className="border-t border-line-muted">
      <div
        className={`mx-auto flex ${width} flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-ink-muted`}
      >
        <div className="flex items-center gap-4">
          <MimusLogo className="h-[34px] w-auto text-ink" />
          <span>© Mimus</span>
        </div>
        <nav aria-label="Legal">
          <ul className="flex flex-wrap gap-4">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link href={link.href} className="hover:text-ink">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
