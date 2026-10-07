'use client';

import { Search } from 'lucide-react';
import { usePathname } from 'next/navigation';
import { searchPlaceholderFor } from './view-toggle';

export function SearchPlaceholder() {
  const pathname = usePathname() ?? '';
  const placeholder = searchPlaceholderFor(pathname);

  return (
    <div className="relative hidden w-56 sm:block">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-ink-faint" />
      <input
        disabled
        placeholder={placeholder}
        className="w-full rounded-pill border border-line-muted bg-paper py-1.5 pr-3 pl-9 text-sm text-ink-faint placeholder:text-ink-faint"
      />
    </div>
  );
}
