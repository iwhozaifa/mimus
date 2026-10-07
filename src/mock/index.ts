import { DEPARTMENTS } from './departments';
import { DEALS_BY_DEPARTMENT } from './pipeline';
import { GROUND_DETAILS } from './ground';
import type { Department, DepartmentSlug, Deal, GroundDetail } from './types';

export * from './types';
export { DEPARTMENTS } from './departments';
export { DEALS_BY_DEPARTMENT } from './pipeline';
export { SKY_KPI_TILES, NEEDS_YOU_ITEMS, MONDAY_SCHEDULE } from './sky';
export { GROUND_DETAILS, getMostUrgentDealId } from './ground';

export function getDepartmentBySlug(slug: string): Department | undefined {
  return DEPARTMENTS.find((department) => department.slug === slug);
}

export function getDealsForDepartment(slug: DepartmentSlug): Deal[] {
  return DEALS_BY_DEPARTMENT[slug] ?? [];
}

export function getGroundDetail(dealId: string): GroundDetail | undefined {
  return GROUND_DETAILS[dealId];
}
