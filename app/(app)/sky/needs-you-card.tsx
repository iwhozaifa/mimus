import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { SwoopPill } from '@/components/ui/swoop-pill';
import { NEEDS_YOU_ITEMS } from '@/src/mock';

export function NeedsYouCard() {
  return (
    <Card className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-ink">Needs you</h2>
        <p className="text-xs text-ink-faint">Found by Mimus overnight</p>
      </div>
      <ul className="flex flex-col divide-y divide-line-muted">
        {NEEDS_YOU_ITEMS.map((item, index) => (
          <li
            key={index}
            className="flex items-center justify-between gap-4 py-3 first:pt-0 last:pb-0"
          >
            <div className="flex flex-col gap-1">
              <Badge uppercase>{item.category}</Badge>
              <p className="text-sm text-ink">{item.description}</p>
            </div>
            <div className="flex shrink-0 items-center gap-3">
              <span className="text-sm font-medium text-ink">{item.amountLabel}</span>
              <SwoopPill direction="down" href={item.dealId ? `/ground/${item.dealId}` : '/sky'}>
                Swoop
              </SwoopPill>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
