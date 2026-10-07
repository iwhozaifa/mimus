import { Card } from '@/components/ui/card';
import type { Deal, DealStage } from '@/src/mock';
import { DealCard } from './deal-card';

const STAGES: { id: DealStage; label: string }[] = [
  { id: 'discovery', label: 'Discovery' },
  { id: 'proposal', label: 'Proposal' },
  { id: 'negotiation', label: 'Negotiation' },
];

export function KanbanBoard({ deals, departmentName }: { deals: Deal[]; departmentName: string }) {
  if (deals.length === 0) {
    return (
      <Card>
        <p className="text-sm text-ink-muted">No pipeline data yet for {departmentName}.</p>
      </Card>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {STAGES.map((stage) => {
        const stageDeals = deals.filter((deal) => deal.stage === stage.id);
        const total = stageDeals.reduce((sum, deal) => sum + deal.amount, 0);

        return (
          <div key={stage.id} className="flex flex-col gap-3 rounded-card bg-paper p-3">
            <div className="flex items-baseline justify-between px-1">
              <h3 className="font-semibold text-ink">{stage.label}</h3>
              <span className="text-sm text-ink-muted">${Math.round(total / 1000)}K</span>
            </div>
            <div className="flex flex-col gap-3">
              {stageDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
