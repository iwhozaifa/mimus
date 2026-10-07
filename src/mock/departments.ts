import type { Department } from './types';

export const DEPARTMENTS: Department[] = [
  { slug: 'sales', name: 'Sales', statusLine: '4 deals stalled' },
  { slug: 'finance', name: 'Finance', statusLine: '1 invoice overdue' },
  { slug: 'operations', name: 'Operations', statusLine: 'On track' },
  { slug: 'marketing', name: 'Marketing', statusLine: '3 posts scheduled' },
  { slug: 'people', name: 'People', statusLine: '2 starting Monday' },
];
