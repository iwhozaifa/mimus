import type { GroundDetail } from './types';

export const GROUND_DETAILS: Record<string, GroundDetail> = {
  'acme-dental': {
    dealId: 'acme-dental',
    department: 'sales',
    title: 'Acme Dental',
    amountLabel: '$40,000',
    stageLabel: 'Proposal, 9 days',
    owner: 'Jordan Lee',
    timeline: [
      {
        date: 'Sep 22',
        title: 'Email from Dr. Priya Patel',
        detail: '"Looks good. Can we split payment across two quarters?"',
        badge: 'No reply',
      },
      {
        date: 'Sep 19',
        title: 'Proposal opened 3 times',
        detail: 'Pricing page viewed longest',
      },
      {
        date: 'Sep 17',
        title: 'Proposal v2 sent by Jordan',
        detail: 'Acme Dental Proposal v2.pdf',
      },
      {
        date: 'Sep 12',
        title: 'Discovery call, 45 min',
        detail: 'Notes: 3 locations, wants to go live before January',
      },
    ],
    people: [
      { name: 'Dr. Priya Patel', role: 'Owner, decision maker' },
      { name: 'Sam Ortiz', role: 'Office manager' },
    ],
    files: [{ name: 'Acme Dental Proposal v2.pdf' }, { name: 'Discovery call notes' }],
    insightLines: [
      'Dr. Patel asked about splitting payment on Sep 22. Nobody replied. She reread the pricing page twice after.',
    ],
  },
};

export function getMostUrgentDealId(): string {
  return 'acme-dental';
}
