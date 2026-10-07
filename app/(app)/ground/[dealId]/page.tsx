import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { getGroundDetail } from '@/src/mock';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { Card } from '@/components/ui/card';
import { SwoopPill } from '@/components/ui/swoop-pill';
import { Breadcrumb } from './breadcrumb';
import { FilesCard } from './files-card';
import { InsightCard } from './insight-card';
import { PeopleCard } from './people-card';
import { TimelineCard } from './timeline-card';

export default function GroundDealPage({ params }: { params: Promise<{ dealId: string }> }) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <GroundDealContent paramsPromise={params} />
    </Suspense>
  );
}

async function GroundDealContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ dealId: string }>;
}) {
  await connection();
  const { dealId } = await paramsPromise;

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    redirect(`/sign-in?next=/ground/${dealId}`);
  }

  const detail = getGroundDetail(dealId);

  if (!detail) {
    return (
      <Card className="flex flex-col items-start gap-4">
        <p className="text-sm text-ink-muted">This deal isn&apos;t in the sample data.</p>
        <SwoopPill direction="up" href="/sky">
          Soar to Sky
        </SwoopPill>
      </Card>
    );
  }

  return (
    <div className="flex flex-col gap-6">
      <Breadcrumb detail={detail} />
      <div>
        <h1 className="text-2xl font-semibold text-ink">{detail.title}</h1>
        <p className="mt-1 text-sm text-ink-muted">
          {detail.amountLabel} · {detail.stageLabel} · Owner: {detail.owner}
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <TimelineCard timeline={detail.timeline} />
        <div className="flex flex-col gap-4">
          <InsightCard insightLines={detail.insightLines} />
          <PeopleCard people={detail.people} />
          <FilesCard files={detail.files} />
        </div>
      </div>
    </div>
  );
}
