import type { ModelTier } from '@/src/server/agent/providers/types';
import { withEscalation } from '@/src/server/agent/router/escalate';
import { describe, expect, it, vi } from 'vitest';

describe('withEscalation', () => {
  it('returns the first attempt when it passes the output check', async () => {
    const attempt = vi.fn(async (tier: ModelTier) => `answer@${tier}`);

    const outcome = await withEscalation({ tier: 'fast', attempt, passes: () => true });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(outcome).toEqual({ result: 'answer@fast', tier: 'fast', attempts: ['answer@fast'] });
  });

  it('retries exactly once, one tier up, when the check fails', async () => {
    const attempt = vi.fn(async (tier: ModelTier) => `answer@${tier}`);

    const outcome = await withEscalation({ tier: 'fast', attempt, passes: () => false });

    expect(attempt.mock.calls.map(([tier]) => tier)).toEqual(['fast', 'standard']);
    // The second result is returned even if it also fails -- once, not a loop.
    expect(outcome).toEqual({
      result: 'answer@standard',
      tier: 'standard',
      attempts: ['answer@fast', 'answer@standard'],
    });
  });

  it('does not escalate past maxTier (e.g. when the spend cap lowered the ceiling)', async () => {
    const attempt = vi.fn(async (tier: ModelTier) => `answer@${tier}`);

    const outcome = await withEscalation({
      tier: 'standard',
      maxTier: 'standard',
      attempt,
      passes: () => false,
    });

    expect(attempt).toHaveBeenCalledTimes(1);
    expect(outcome.tier).toBe('standard');
  });

  it('does not retry from the deep tier', async () => {
    const attempt = vi.fn(async (tier: ModelTier) => tier);

    await withEscalation({ tier: 'deep', attempt, passes: () => false });

    expect(attempt).toHaveBeenCalledTimes(1);
  });
});
