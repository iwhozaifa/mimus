import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import type { Deal } from '@/src/mock';

export function DealCard({ deal }: { deal: Deal }) {
  return (
    <Link
      href={`/ground/${deal.id}`}
      className={`block rounded-card border bg-paper-raised p-4 transition-colors ${
        deal.flagged ? 'border-accent' : 'border-line-muted hover:border-ink'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-semibold text-ink">{deal.company}</p>
        {deal.flagged && <span className="text-xs font-medium text-accent-strong">Swoop ↓</span>}
      </div>
      <p className="mt-1 text-sm text-ink-muted">
        ${deal.amount.toLocaleString()} · {deal.daysInStage} days in stage
      </p>
      {deal.flagReason && (
        <Badge variant="accent-soft" className="mt-3">
          {deal.flagReason}
        </Badge>
      )}
    </Link>
  );
}
