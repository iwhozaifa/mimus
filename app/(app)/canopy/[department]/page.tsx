import { getCurrentWorkspaceContext } from '@/src/server/workspaces/getCurrentWorkspaceContext';
import { getDealsForDepartment, getDepartmentBySlug, type DepartmentSlug } from '@/src/mock';
import { redirect } from 'next/navigation';
import { connection } from 'next/server';
import { Suspense } from 'react';
import { DepartmentPills } from './department-pills';
import { InsightRail } from './insight-rail';
import { KanbanBoard } from './kanban-board';
import { MetricTiles } from './metric-tiles';

export default function CanopyDepartmentPage({
  params,
}: {
  params: Promise<{ department: string }>;
}) {
  return (
    <Suspense fallback={<p className="text-ink-muted">Loading…</p>}>
      <CanopyDepartmentContent paramsPromise={params} />
    </Suspense>
  );
}

async function CanopyDepartmentContent({
  paramsPromise,
}: {
  paramsPromise: Promise<{ department: string }>;
}) {
  await connection();
  const { department: slug } = await paramsPromise;
  const department = getDepartmentBySlug(slug);

  if (!department) {
    redirect('/canopy/sales');
  }

  const context = await getCurrentWorkspaceContext();
  if (!context) {
    redirect(`/sign-in?next=/canopy/${slug}`);
  }

  const deals = getDealsForDepartment(slug as DepartmentSlug);

  return (
    <div className="flex flex-col gap-8">
      <DepartmentPills activeSlug={department.slug} />
      <MetricTiles deals={deals} />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <KanbanBoard deals={deals} departmentName={department.name} />
        <InsightRail departmentName={department.name} deals={deals} />
      </div>
    </div>
  );
}
