import Link from 'next/link';
import { Suspense } from 'react';
import { AvatarMenu } from './avatar-menu';
import { SearchPlaceholder } from './search-placeholder';
import { ViewToggle } from './view-toggle';

function Logo() {
  return (
    <Link href="/sky" className="flex items-center gap-2 text-lg font-semibold text-ink">
      <svg viewBox="0 0 24 24" fill="none" className="size-5 text-accent" aria-hidden>
        <path
          d="M3 12c4-7 11-9 18-9-1 7-3 14-11 15-2.5.3-5-.3-7-2 2-1 4-1 6-2-3 0-5-1-6-2Z"
          fill="currentColor"
        />
      </svg>
      mimus
    </Link>
  );
}

export function TopNav({ identity }: { identity: { initials: string; email: string } | null }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <Logo />
      <Suspense fallback={<div className="h-9 w-48 rounded-pill bg-paper" />}>
        <ViewToggle />
      </Suspense>
      <div className="flex items-center gap-3">
        <Suspense fallback={<div className="hidden h-8 w-56 rounded-pill bg-paper sm:block" />}>
          <SearchPlaceholder />
        </Suspense>
        {identity ? (
          <AvatarMenu initials={identity.initials} email={identity.email} />
        ) : (
          <Link
            href="/sign-in"
            className="text-sm font-medium text-accent-strong hover:text-accent"
          >
            Sign in
          </Link>
        )}
      </div>
    </div>
  );
}
