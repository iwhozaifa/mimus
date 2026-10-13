import Link from 'next/link';

const LINKS = [
  { href: '/privacy', label: 'Privacy Policy' },
  { href: '/terms', label: 'Terms of Service' },
  { href: '/account-deletion', label: 'Delete your account' },
];

// The public footer. Google's OAuth verification checks that the homepage
// links to the same Privacy Policy URL as the consent screen, so every
// public page carries it.
export function SiteFooter() {
  return (
    <footer className="border-t border-line-muted">
      <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3 px-6 py-6 text-sm text-ink-muted">
        <span>© Mimus</span>
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
