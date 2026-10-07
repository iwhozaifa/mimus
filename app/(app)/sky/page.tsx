import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { getFirstName } from '@/src/lib/get-display-name';
import { NEEDS_YOU_ITEMS, SKY_KPI_TILES } from '@/src/mock';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { DepartmentRow } from './department-row';
import { KpiTile } from './kpi-tile';
import { MondayCard } from './monday-card';
import { NeedsYouCard } from './needs-you-card';

export default function SkyPage() {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <SkyContent />
    </Suspense>
  );
}

async function SkyContent() {
  await connection();
  const context = await getCurrentWorkspaceContext();

  if (!context) {
    redirect('/sign-in?next=/sky');
  }

  const firstName = getFirstName(context.fullName, context.email);
  const today = new Intl.DateTimeFormat('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  return (
    <div className="flex flex-col gap-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold text-ink">Good morning, {firstName}.</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Sky view · {today} · {NEEDS_YOU_ITEMS.length} things need you
          </p>
        </div>
        <p className="shrink-0 text-xs text-ink-faint">Sample data</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {SKY_KPI_TILES.map((tile) => (
          <KpiTile key={tile.id} tile={tile} />
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <NeedsYouCard />
        <MondayCard />
      </div>

      <DepartmentRow />
    </div>
  );
}
