'use client';

import { ChevronDown } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Avatar } from '@/components/ui/avatar';
import { SignOutButton } from '../sign-out-button';

const LINKS = [
  { href: '/settings/connections', label: 'Connections' },
  { href: '/members', label: 'Members' },
  { href: '/billing', label: 'Billing' },
  { href: '/feature-switches', label: 'Feature switches' },
  { href: '/audit-log', label: 'Audit log' },
];

export function AvatarMenu({ initials, email }: { initials: string; email: string }) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    function handleClick(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        className="flex items-center gap-1 rounded-full"
        aria-expanded={open}
        aria-label="Account menu"
      >
        <Avatar initials={initials} />
        <ChevronDown className="size-4 text-ink-muted" />
      </button>
      {open && (
        <div className="absolute top-full right-0 z-10 mt-2 w-56 rounded-card border border-line-muted bg-paper-raised p-2 shadow-sm">
          <p className="truncate px-3 py-2 text-xs text-ink-faint">{email}</p>
          <ul className="flex flex-col">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  onClick={() => setOpen(false)}
                  className="block rounded-md px-3 py-2 text-sm text-ink-muted hover:bg-paper hover:text-ink"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
          <div className="mt-2 border-t border-line-muted pt-2">
            <SignOutButton />
          </div>
        </div>
      )}
    </div>
  );
}
