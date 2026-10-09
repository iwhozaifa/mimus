import type { AiCompletionRequest, AiProvider } from '@/src/server/agent/providers/types';
import { routeRequest, type RouteCandidate } from '@/src/server/agent/router/classifier';
import { describe, expect, it, vi } from 'vitest';

const candidates: RouteCandidate[] = [
  {
    name: 'lookup',
    description: 'Find facts in email, calendar and Slack',
    defaultTier: 'fast',
    defaultPriority: 'interactive',
  },
  {
    name: 'draft',
    description: 'Draft an email reply',
    defaultTier: 'standard',
    defaultPriority: 'interactive',
  },
];

// Fake provider that answers the classify tool call with the given input.
function classifierReturning(input: unknown) {
  const complete = vi.fn<AiProvider['complete']>(async () => ({
    modelId: 'claude-haiku-5-5',
    stopReason: 'tool_use',
    content: [{ type: 'tool_use', id: 'tu_1', name: 'classify', input }],
    usage: { inputTokens: 50, outputTokens: 10 },
  }));
  return { complete, provider: { complete } satisfies AiProvider };
}

describe('routeRequest', () => {
  it('classifies free text on the fast tier with a forced classify tool', async () => {
    const { complete, provider } = classifierReturning({
      module: 'lookup',
      tier: 'fast',
      confidence: 0.9,
    });

    await routeRequest({ provider, question: 'who emailed me about the lease?', candidates });

    const request = complete.mock.calls[0][0] as AiCompletionRequest;
    expect(request.tier).toBe('fast');
    expect(request.toolChoice).toEqual({ name: 'classify' });
    const schema = request.tools![0].inputSchema as {
      properties: { module: { enum: string[] } };
    };
    expect(schema.properties.module.enum).toEqual(['lookup', 'draft']);
    expect(JSON.stringify(request.messages)).toContain('who emailed me about the lease?');
  });

  it("uses the module's default tier and priority when the classifier is confident", async () => {
    const { provider } = classifierReturning({ module: 'draft', tier: 'fast', confidence: 0.92 });

    const decision = await routeRequest({ provider, question: 'reply to Sam', candidates });

    expect(decision).toMatchObject({
      module: 'draft',
      tier: 'standard',
      priority: 'interactive',
      confidence: 0.92,
      escalatedForLowConfidence: false,
    });
    expect(decision.classification).toEqual({
      modelId: 'claude-haiku-5-5',
      usage: { inputTokens: 50, outputTokens: 10 },
    });
  });

  it('takes the higher tier when the classifier says the question needs more', async () => {
    const { provider } = classifierReturning({ module: 'lookup', tier: 'deep', confidence: 0.8 });

    const decision = await routeRequest({ provider, question: 'compare Q3 vs Q2', candidates });

    expect(decision.tier).toBe('deep');
  });

  it('escalates one tier when the classifier has low confidence', async () => {
    const { provider } = classifierReturning({ module: 'lookup', tier: 'fast', confidence: 0.4 });

    const decision = await routeRequest({ provider, question: 'hmm?', candidates });

    expect(decision).toMatchObject({
      module: 'lookup',
      tier: 'standard',
      escalatedForLowConfidence: true,
    });
  });

  it('falls back to the first candidate, escalated, when the output is unusable', async () => {
    const { provider } = classifierReturning({ module: 'delete-everything', confidence: 'x' });

    const decision = await routeRequest({ provider, question: '???', candidates });

    expect(decision).toMatchObject({
      module: 'lookup',
      tier: 'standard',
      confidence: 0,
      escalatedForLowConfidence: true,
    });
  });

  it('skips the model call entirely when the caller names the module (rule-based step 1)', async () => {
    const { complete, provider } = classifierReturning({});

    const decision = await routeRequest({
      provider,
      question: 'draft a reply',
      candidates,
      module: 'draft',
    });

    expect(complete).not.toHaveBeenCalled();
    expect(decision).toMatchObject({ module: 'draft', tier: 'standard', confidence: 1 });
    expect(decision.classification).toBeNull();
  });
});
