import { syncCalendlyAccount } from '@/src/server/connectors/calendly/sync';

// Calendly webhooks are a paid-plan feature (Free = no webhooks at all,
// per PLAN.md's platform-limits note) -- poll() is the fallback for
// accounts on a plan where registerCalendlyWebhook() was never possible.
// It's identical to backfill(): syncCalendlyAccount() is already
// idempotent and re-lists the same rolling window every time, so calling
// it repeatedly on a schedule is what polling *is* here, not a
// differently-scoped operation.
export async function pollCalendlyAccount(connectedAccountId: string): Promise<void> {
  await syncCalendlyAccount(connectedAccountId);
}
