import { Card } from '@/components/ui/card';
import { MONDAY_SCHEDULE } from '@/src/mock';

export function MondayCard() {
  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-ink">Monday</h2>
      <ul className="flex flex-col gap-3">
        {MONDAY_SCHEDULE.map((item) => (
          <li key={item.time} className="flex items-baseline gap-3 text-sm">
            <span className="w-12 shrink-0 text-ink-faint">{item.time}</span>
            <span className="text-ink">{item.title}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-card bg-accent-soft p-3 text-sm text-ink">
        Mimus prepared briefs for all three.
      </div>
    </Card>
  );
}
