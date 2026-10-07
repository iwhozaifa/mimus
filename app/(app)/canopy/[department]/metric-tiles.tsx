import { Card } from '@/components/ui/card';
import type { Deal } from '@/src/mock';

function formatCurrency(amount: number): string {
  if (amount >= 1_000_000) {
    return `$${(amount / 1_000_000).toFixed(2)}M`;
  }
  if (amount >= 1_000) {
    return `$${Math.round(amount / 1_000)}K`;
  }
  return `$${amount}`;
}

export function MetricTiles({ deals }: { deals: Deal[] }) {
  const openPipeline = deals.reduce((sum, deal) => sum + deal.amount, 0);
  const stalledDeals = deals.filter((deal) => deal.flagged);
  const avgCycle = deals.length
    ? Math.round(deals.reduce((sum, deal) => sum + deal.daysInStage, 0) / deals.length)
    : 0;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">Open pipeline</p>
        <p className="text-2xl font-semibold text-ink">{formatCurrency(openPipeline)}</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">Win rate, 90 days</p>
        <p className="text-2xl font-semibold text-ink">31%</p>
      </Card>
      <Card className="flex flex-col gap-2">
        <p className="text-sm text-ink-muted">Average cycle</p>
        <p className="text-2xl font-semibold text-ink">{avgCycle} days</p>
      </Card>
      <Card variant="dark" className="flex flex-col gap-2">
        <p className="text-sm text-ink-foreground/70">Stalled over 7 days</p>
        <p className="text-2xl font-semibold text-accent">{stalledDeals.length} deals</p>
      </Card>
    </div>
  );
}
