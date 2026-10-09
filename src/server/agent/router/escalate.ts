import type { ModelTier } from '@/src/server/agent/providers/types';
import { tierUp } from '@/src/server/agent/router/tiers';

const TIERS: ModelTier[] = ['fast', 'standard', 'deep'];

// Step 3: if an answer fails its output checks, retry one tier up -- once.
// maxTier is the ceiling the spend cap allows; every attempt is returned so
// the caller can log the cost of both.
export async function withEscalation<T>({
  tier,
  maxTier = 'deep',
  attempt,
  passes,
}: {
  tier: ModelTier;
  maxTier?: ModelTier;
  attempt: (tier: ModelTier) => Promise<T>;
  passes: (result: T) => boolean;
}): Promise<{ result: T; tier: ModelTier; attempts: T[] }> {
  const first = await attempt(tier);
  const next = tierUp(tier);
  const canEscalate = next !== tier && TIERS.indexOf(next) <= TIERS.indexOf(maxTier);
  if (passes(first) || !canEscalate) return { result: first, tier, attempts: [first] };

  const second = await attempt(next);
  return { result: second, tier: next, attempts: [first, second] };
}
