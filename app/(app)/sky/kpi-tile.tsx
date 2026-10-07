import { BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { ProgressBar } from '@/components/ui/progress-bar';
import { Sparkline } from '@/components/ui/sparkline';
import { SwoopPill } from '@/components/ui/swoop-pill';
import type { DepartmentSlug, KpiTile as KpiTileType } from '@/src/mock';

const DEPARTMENT_FOR_TILE: Record<string, DepartmentSlug> = {
  'cash-on-hand': 'finance',
  'revenue-this-month': 'finance',
  'open-pipeline': 'sales',
  'team-load': 'people',
};

export function KpiTile({ tile }: { tile: KpiTileType }) {
  const department = DEPARTMENT_FOR_TILE[tile.id];

  return (
    <Card className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm text-ink-muted">{tile.label}</p>
        {department && (
          <SwoopPill
            direction="down"
            tone="accent"
            href={`/canopy/${department}`}
            className="px-2.5 py-1 text-xs"
          >
            Swoop
          </SwoopPill>
        )}
      </div>
      <p className="text-2xl font-semibold text-ink">{tile.value}</p>
      {tile.variant === 'sparkline' && (
        <div className="flex flex-col gap-1">
          {tile.deltaLabel && <p className="text-sm text-accent-strong">{tile.deltaLabel}</p>}
          {tile.sparklineData && <Sparkline data={tile.sparklineData} />}
        </div>
      )}
      {tile.variant === 'progress' && (
        <div className="flex flex-col gap-1">
          <ProgressBar value={tile.progressValue ?? 0} max={tile.progressMax ?? 1} />
          {tile.progressLabel && <p className="text-xs text-ink-faint">{tile.progressLabel}</p>}
        </div>
      )}
      {tile.variant === 'plain-progress' && (
        <ProgressBar value={tile.progressValue ?? 0} max={tile.progressMax ?? 1} tone="faint" />
      )}
      {tile.variant === 'stat-icon' && (
        <div className="flex items-center gap-2 text-xs text-ink-faint">
          <BarChart3 className="size-4" />
          <span>{tile.statIconLabel}</span>
        </div>
      )}
    </Card>
  );
}
