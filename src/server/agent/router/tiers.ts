import type { AiUsage, ModelTier } from '@/src/server/agent/providers/types';

const TIER_ORDER: ModelTier[] = ['fast', 'standard', 'deep'];

const TIER_MODELS: Record<ModelTier, string> = {
  fast: 'gpt-6-luna',
  standard: 'gpt-6.1-sol',
  deep: 'gpt-5.6-sol',
};

// USD per million tokens, from developers.openai.com/api/docs/pricing
// (checked 2026-10-11). A request whose input is over 272k tokens pays the
// `long` rate for the whole request. GPT-5.6 Sol's rate is promotional "at
// least through November 21, 2026" -- re-check it after that date.
interface Rate {
  input: number;
  output: number;
}
const LONG_CONTEXT_TOKENS = 272_000;
const MODEL_PRICING: Record<string, { base: Rate; long?: { overInputTokens: number } & Rate }> = {
  'gpt-6-luna': {
    base: { input: 0.1, output: 0.5 },
    long: { overInputTokens: LONG_CONTEXT_TOKENS, input: 0.2, output: 0.75 },
  },
  'gpt-6.1-sol': {
    base: { input: 2, output: 10 },
    long: { overInputTokens: LONG_CONTEXT_TOKENS, input: 4, output: 15 },
  },
  'gpt-5.6-sol': {
    base: { input: 4, output: 20 },
    long: { overInputTokens: LONG_CONTEXT_TOKENS, input: 8, output: 30 },
  },
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
