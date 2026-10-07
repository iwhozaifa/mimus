export type DepartmentSlug = 'sales' | 'finance' | 'operations' | 'marketing' | 'people';

export type Department = {
  slug: DepartmentSlug;
  name: string;
  statusLine: string;
};

export type DealStage = 'discovery' | 'proposal' | 'negotiation';

export type Deal = {
  id: string;
  company: string;
  amount: number;
  stage: DealStage;
  daysInStage: number;
  flagged?: boolean;
  flagReason?: string;
};

export type KpiTileVariant = 'sparkline' | 'progress' | 'plain-progress' | 'stat-icon';

export type KpiTile = {
  id: string;
  label: string;
  value: string;
  variant: KpiTileVariant;
  deltaLabel?: string;
  sparklineData?: number[];
  progressValue?: number;
  progressMax?: number;
  progressLabel?: string;
  statIconLabel?: string;
};

export type NeedsYouItem = {
  category: string;
  description: string;
  amountLabel: string;
  dealId?: string;
};

export type ScheduleItem = {
  time: string;
  title: string;
};

export type TimelineEntry = {
  date: string;
  title: string;
  detail: string;
  badge?: string;
};

export type Person = {
  name: string;
  role: string;
};

export type FileRef = {
  name: string;
};

export type GroundDetail = {
  dealId: string;
  department: DepartmentSlug;
  title: string;
  amountLabel: string;
  stageLabel: string;
  owner: string;
  timeline: TimelineEntry[];
  people: Person[];
  files: FileRef[];
  insightLines: string[];
};
