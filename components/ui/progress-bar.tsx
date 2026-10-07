export function ProgressBar({
  value,
  max,
  tone = 'accent',
}: {
  value: number;
  max: number;
  tone?: 'accent' | 'faint';
}) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-pill bg-line-muted">
      <div
        className={`h-full rounded-pill ${tone === 'accent' ? 'bg-accent' : 'bg-accent/40'}`}
        style={{ width: `${percent}%` }}
      />
    </div>
  );
}
