import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

export function InsightCard({ insightLines }: { insightLines: string[] }) {
  return (
    <Card variant="dark" showStatusDot className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold">Why it&apos;s stalled</h2>
      {insightLines.map((line, index) => (
        <p key={index} className="text-sm text-ink-foreground/80">
          {line}
        </p>
      ))}
      <div className="flex flex-col gap-2">
        <Button variant="primary" className="bg-accent hover:bg-accent-strong">
          Draft reply offering two-quarter terms
        </Button>
        <Button
          variant="outline"
          className="border-ink-foreground/30 text-ink-foreground hover:bg-ink-foreground/10"
        >
          Assign to Jordan, due today
        </Button>
      </div>
    </Card>
  );
}
