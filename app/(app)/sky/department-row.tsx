import Link from 'next/link';
import { DEPARTMENTS } from '@/src/mock';

export function DepartmentRow() {
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Departments</h2>
        <p className="text-xs text-ink-faint">Perch on any one to see it end to end</p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        {DEPARTMENTS.map((department) => (
          <Link
            key={department.slug}
            href={`/canopy/${department.slug}`}
            className="rounded-card border border-line-muted bg-paper-raised p-4 transition-colors hover:border-accent"
          >
            <p className="font-semibold text-ink">{department.name}</p>
            <p className="mt-1 text-sm text-ink-muted">{department.statusLine}</p>
          </Link>
        ))}
      </div>
    </section>
  );
}
