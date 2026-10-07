import Link from 'next/link';
import { SwoopPill } from '@/components/ui/swoop-pill';
import { getDepartmentBySlug, type GroundDetail } from '@/src/mock';

export function Breadcrumb({ detail }: { detail: GroundDetail }) {
  const department = getDepartmentBySlug(detail.department);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <nav className="flex items-center gap-2 text-sm text-ink-faint">
        <Link href="/sky" className="hover:text-ink">
          Sky
        </Link>
        <span>/</span>
        <Link href={`/canopy/${detail.department}`} className="hover:text-ink">
          {department?.name}
        </Link>
        <span>/</span>
        <span className="text-ink">{detail.title}</span>
      </nav>
      <div className="flex items-center gap-2">
        <SwoopPill direction="up" href={`/canopy/${detail.department}`}>
          Soar to {department?.name}
        </SwoopPill>
        <SwoopPill direction="up" href="/sky">
          Soar to Sky
        </SwoopPill>
      </div>
    </div>
  );
}
