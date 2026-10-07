import type { KpiTile, NeedsYouItem, ScheduleItem } from './types';

export const SKY_KPI_TILES: KpiTile[] = [
  {
    id: 'cash-on-hand',
    label: 'Cash on hand',
    value: '$412,800',
    variant: 'sparkline',
    deltaLabel: '+6% vs August',
    sparklineData: [8, 6, 7, 9, 8, 10, 12, 11, 13, 14],
  },
  {
    id: 'revenue-this-month',
    label: 'Revenue this month',
    value: '$186,400',
    variant: 'progress',
    progressValue: 186_400,
    progressMax: 240_000,
    progressLabel: '78% of $240K target',
  },
  {
    id: 'open-pipeline',
    label: 'Open pipeline',
    value: '$1.24M',
    variant: 'plain-progress',
    progressValue: 7,
    progressMax: 10,
  },
  {
    id: 'team-load',
    label: 'Team load',
    value: '82%',
    variant: 'stat-icon',
    statIconLabel: '1 person over capacity',
  },
];

export const NEEDS_YOU_ITEMS: NeedsYouItem[] = [
  {
    category: 'Sales',
    description: 'Acme Dental proposal stalled 9 days. Client asked about payment terms.',
    amountLabel: '$40,000',
    dealId: 'acme-dental',
  },
  {
    category: 'Finance',
    description: 'Invoice 1042 to Brightline is 14 days overdue.',
    amountLabel: '$18,500',
  },
  {
    category: 'People',
    description: 'Two hires start Monday. Onboarding owner not assigned.',
    amountLabel: '2 hires',
  },
];

export const MONDAY_SCHEDULE: ScheduleItem[] = [
  { time: '9:00', title: 'Leadership sync' },
  { time: '11:30', title: 'Acme Dental follow-up' },
  { time: '2:00', title: 'New hire welcome' },
];
