import Link from 'next/link';
import { SwoopPill } from '@/components/ui/swoop-pill';
import { DEPARTMENTS, getDepartmentBySlug } from '@/src/mock';

export function DepartmentPills({ activeSlug }: { activeSlug: string }) {
  const activeDepartment = getDepartmentBySlug(activeSlug);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {DEPARTMENTS.map((department) => {
          const active = department.slug === activeSlug;
          return (
            <Link
              key={department.slug}
              href={`/canopy/${department.slug}`}
              className={`rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'border-accent text-accent-strong'
                  : 'border-line-muted text-ink-muted hover:border-ink'
              }`}
            >
              {department.name}
            </Link>
          );
        })}
      </div>
      <div className="flex items-center gap-3">
        <p className="text-xs text-ink-faint">Perching on {activeDepartment?.name}</p>
        <SwoopPill direction="up" href="/sky">
          Soar to Sky
        </SwoopPill>
      </div>
    </div>
  );
}
