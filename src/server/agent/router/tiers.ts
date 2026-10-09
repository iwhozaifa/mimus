import type { AiUsage, ModelTier } from '@/src/server/agent/providers/types';

const TIER_ORDER: ModelTier[] = ['fast', 'standard', 'deep'];

const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'claude-haiku-5-5',
  standard: 'claude-sonnet-5-5',
  deep: 'claude-opus-5-5',
};

// USD per million tokens, from platform.claude.com/docs/en/about-claude/pricing
// (checked 2026-10-09). Haiku 5.5 is priced by prompt length: a request whose
// input is over 100k tokens pays the `long` rate for the whole request.
interface Rate {
  input: number;
  output: number;
}
const MODEL_PRICING: Record<string, { base: Rate; long?: { overInputTokens: number } & Rate }> = {
  'claude-haiku-5-5': {
    base: { input: 0.1, output: 0.5 },
    long: { overInputTokens: 100_000, input: 0.5, output: 2.5 },
  },
  'claude-sonnet-5-5': { base: { input: 2, output: 10 } },
  'claude-opus-5-5': { base: { input: 4, output: 20 } },
};

export function modelForTier(tier: ModelTier): string {
  return TIER_MODELS[tier];
}

export function tierUp(tier: ModelTier): ModelTier {
  return TIER_ORDER[Math.min(TIER_ORDER.indexOf(tier) + 1, TIER_ORDER.length - 1)];
}

export function tierDown(tier: ModelTier): ModelTier {
  return TIER_ORDER[Math.max(TIER_ORDER.indexOf(tier) - 1, 0)];
}

export function costUsd(modelId: string, usage: AiUsage): number {
  const pricing = MODEL_PRICING[modelId];
  if (!pricing) throw new Error(`No pricing configured for model "${modelId}"`);
  const rate =
    pricing.long && usage.inputTokens > pricing.long.overInputTokens ? pricing.long : pricing.base;
  return (usage.inputTokens * rate.input + usage.outputTokens * rate.output) / 1_000_000;
}
