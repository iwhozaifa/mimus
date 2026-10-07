import { isWorkspaceReadOnly } from '@/src/server/billing/killSwitch';
import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { getInitials } from '@/src/lib/get-display-name';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { ReadOnlyBanner } from './read-only-banner';
import { TopNav } from './top-nav';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-line-muted bg-paper-raised">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <Suspense fallback={<TopNav identity={null} />}>
            <TopNavServer />
          </Suspense>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Suspense fallback={null}>
          <ReadOnlyBannerServer />
        </Suspense>
        {children}
      </main>
    </div>
  );
}

async function TopNavServer() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return <TopNav identity={null} />;
  }

  return (
    <TopNav
      identity={{ initials: getInitials(context.fullName, context.email), email: context.email }}
    />
  );
}

async function ReadOnlyBannerServer() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    return null;
  }

  const readOnly = await isWorkspaceReadOnly(context.workspaceId);
  return <ReadOnlyBanner isReadOnly={readOnly} />;
}
