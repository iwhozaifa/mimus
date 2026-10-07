'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { getDepartmentBySlug } from '@/src/mock';

const SEGMENTS = [
  { href: '/sky', label: 'Sky' },
  { href: '/canopy', label: 'Canopy' },
  { href: '/ground', label: 'Ground' },
];

export function ViewToggle() {
  const pathname = usePathname() ?? '';

  return (
    <nav className="inline-flex items-center gap-1 rounded-pill bg-paper p-1">
      {SEGMENTS.map((segment) => {
        const active = pathname.startsWith(segment.href);
        return (
          <Link
            key={segment.href}
            href={segment.href}
            className={`rounded-pill px-4 py-1.5 text-sm font-medium transition-colors ${
              active ? 'bg-ink text-ink-foreground' : 'text-ink-muted hover:text-ink'
            }`}
          >
            {segment.label}
          </Link>
        );
      })}
    </nav>
  );
}

export function searchPlaceholderFor(pathname: string): string {
  if (pathname.startsWith('/canopy/')) {
    const slug = pathname.split('/')[2];
    const department = slug ? getDepartmentBySlug(slug) : undefined;
    return department ? `Ask about ${department.name}` : 'Ask about this department';
  }
  if (pathname.startsWith('/ground')) {
    return 'Ask about this deal';
  }
  return 'Ask Mimus anything';
}
