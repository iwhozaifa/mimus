import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import type { TimelineEntry } from '@/src/mock';

export function TimelineCard({ timeline }: { timeline: TimelineEntry[] }) {
  return (
    <Card>
      <h2 className="mb-4 text-lg font-semibold text-ink">Everything on this deal</h2>
      <ul className="flex flex-col divide-y divide-line-muted">
        {timeline.map((entry, index) => (
          <li key={index} className="flex items-start gap-4 py-4 first:pt-0 last:pb-0">
            <span className="w-14 shrink-0 text-sm text-ink-faint">{entry.date}</span>
            <div className="flex-1">
              <p className="font-medium text-ink">{entry.title}</p>
              <p className="mt-1 text-sm text-ink-muted">{entry.detail}</p>
            </div>
            {entry.badge && (
              <Badge variant="neutral" className="shrink-0 border border-line-muted">
                {entry.badge}
              </Badge>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
