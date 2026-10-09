import { costUsd, modelForTier, tierDown, tierUp } from '@/src/server/agent/router/tiers';
import { describe, expect, it } from 'vitest';

describe('model tiers', () => {
  it('maps each tier to a current Claude model', () => {
    expect(modelForTier('fast')).toBe('claude-haiku-5-5');
    expect(modelForTier('standard')).toBe('claude-sonnet-5-5');
    expect(modelForTier('deep')).toBe('claude-opus-5-5');
  });

  it('steps one tier up or down, clamped at the ends', () => {
    expect(tierUp('fast')).toBe('standard');
    expect(tierUp('standard')).toBe('deep');
    expect(tierUp('deep')).toBe('deep');
    expect(tierDown('deep')).toBe('standard');
    expect(tierDown('standard')).toBe('fast');
    expect(tierDown('fast')).toBe('fast');
  });

  it('prices usage per million tokens from the published rates', () => {
    // Sonnet 5.5: $2 in / $10 out per MTok.
    expect(
      costUsd('claude-sonnet-5-5', { inputTokens: 1_000_000, outputTokens: 100_000 }),
    ).toBeCloseTo(3);
    // Opus 5.5: $4 / $20.
    expect(costUsd('claude-opus-5-5', { inputTokens: 500_000, outputTokens: 50_000 })).toBeCloseTo(
      3,
    );
  });

  it('applies Haiku 5.5 long-prompt pricing above 100k input tokens', () => {
    expect(
      costUsd('claude-haiku-5-5', { inputTokens: 100_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(0.01 + 0.5);
    expect(
      costUsd('claude-haiku-5-5', { inputTokens: 200_000, outputTokens: 1_000_000 }),
    ).toBeCloseTo(0.1 + 2.5);
  });

  it('refuses to price an unknown model rather than logging $0', () => {
    expect(() => costUsd('claude-unknown', { inputTokens: 1, outputTokens: 1 })).toThrow(
      /no pricing/i,
    );
  });
});
