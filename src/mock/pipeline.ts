import type { Deal, DepartmentSlug } from './types';

const SALES_DEALS: Deal[] = [
  {
    id: 'coastal-realty',
    company: 'Coastal Realty',
    amount: 62_000,
    stage: 'discovery',
    daysInStage: 4,
  },
  {
    id: 'summit-logistics',
    company: 'Summit Logistics',
    amount: 120_000,
    stage: 'discovery',
    daysInStage: 2,
  },
  {
    id: 'lumen-wellness',
    company: 'Lumen Wellness',
    amount: 28_000,
    stage: 'discovery',
    daysInStage: 6,
  },
  {
    id: 'acme-dental',
    company: 'Acme Dental',
    amount: 40_000,
    stage: 'proposal',
    daysInStage: 9,
    flagged: true,
    flagReason: 'Stalled: client question unanswered',
  },
  {
    id: 'northgate-builders',
    company: 'Northgate Builders',
    amount: 95_000,
    stage: 'proposal',
    daysInStage: 3,
  },
  {
    id: 'pine-street-law',
    company: 'Pine Street Law',
    amount: 48_000,
    stage: 'proposal',
    daysInStage: 11,
  },
  {
    id: 'harborview-clinics',
    company: 'Harborview Clinics',
    amount: 210_000,
    stage: 'negotiation',
    daysInStage: 8,
  },
  {
    id: 'redwood-supply',
    company: 'Redwood Supply',
    amount: 150_000,
    stage: 'negotiation',
    daysInStage: 5,
  },
];

export const DEALS_BY_DEPARTMENT: Record<DepartmentSlug, Deal[]> = {
  sales: SALES_DEALS,
  finance: [],
  operations: [],
  marketing: [],
  people: [],
};
