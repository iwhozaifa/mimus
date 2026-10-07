import { Card } from '@/components/ui/card';
import { SwoopPill } from '@/components/ui/swoop-pill';
import type { Deal } from '@/src/mock';

export function InsightRail({ departmentName, deals }: { departmentName: string; deals: Deal[] }) {
  const flaggedDeal = deals.find((deal) => deal.flagged);

  return (
    <Card variant="dark" showStatusDot className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Mimus on {departmentName}</h2>
      {flaggedDeal ? (
        <>
          <p className="text-sm text-ink-foreground/80">
            Proposal is where deals are slowing. 3 of 4 stalled deals have an unanswered client
            email.
          </p>
          <p className="text-sm text-ink-foreground/80">
            Fastest win: reply to {flaggedDeal.company} on payment terms.
          </p>
          <SwoopPill direction="down" tone="accent" href={`/ground/${flaggedDeal.id}`}>
            Swoop to {flaggedDeal.company}
          </SwoopPill>
        </>
      ) : (
        <p className="text-sm text-ink-foreground/80">Nothing urgent here yet.</p>
      )}
    </Card>
  );
}
