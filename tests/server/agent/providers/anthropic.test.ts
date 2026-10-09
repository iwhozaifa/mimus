import {
  createAnthropicProvider,
  type AnthropicMessagesClient,
} from '@/src/server/agent/providers/anthropic';
import { describe, expect, it, vi } from 'vitest';

// The Anthropic API is a paid external boundary, so it's the one thing
// mocked here: a fake client exposing only messages.create.
function fakeClient(response: unknown) {
  const create = vi.fn(async () => response);
  return { create, client: { messages: { create } } as unknown as AnthropicMessagesClient };
}

describe('anthropic provider', () => {
  it('sends the tier model, system prompt, tools and messages in API shape', async () => {
    const { create, client } = fakeClient({
      model: 'claude-sonnet-5-5',
      stop_reason: 'end_turn',
      content: [{ type: 'text', text: 'hi' }],
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    const provider = createAnthropicProvider({ client });

    await provider.complete({
      tier: 'standard',
      system: 'You are Mimus.',
      maxTokens: 512,
      tools: [
        {
          name: 'searchMessages',
          description: 'Search email',
          inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
      messages: [
        { role: 'user', content: 'who emailed me?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'searchMessages', input: { query: 'x' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: 'tu_1', content: '[]', isError: false }],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith({
      model: 'claude-sonnet-5-5',
      max_tokens: 512,
      system: 'You are Mimus.',
      tools: [
        {
          name: 'searchMessages',
          description: 'Search email',
          input_schema: { type: 'object', properties: { query: { type: 'string' } } },
        },
      ],
      messages: [
        { role: 'user', content: 'who emailed me?' },
        {
          role: 'assistant',
          content: [
            { type: 'tool_use', id: 'tu_1', name: 'searchMessages', input: { query: 'x' } },
          ],
        },
        {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: 'tu_1', content: '[]', is_error: false }],
        },
      ],
    });
  });

  it('normalizes the response: text + tool_use blocks, stop reason, usage', async () => {
    const { client } = fakeClient({
      model: 'claude-haiku-5-5',
      stop_reason: 'tool_use',
      content: [
        { type: 'thinking', thinking: '...' },
        { type: 'text', text: 'Let me look.' },
        { type: 'tool_use', id: 'tu_9', name: 'searchEvents', input: { from: '2026-10-01' } },
      ],
      usage: { input_tokens: 120, output_tokens: 30 },
    });
    const provider = createAnthropicProvider({ client });

    const result = await provider.complete({
      tier: 'fast',
      maxTokens: 256,
      messages: [{ role: 'user', content: 'meetings?' }],
    });

    expect(result).toEqual({
      modelId: 'claude-haiku-5-5',
      stopReason: 'tool_use',
      content: [
        { type: 'text', text: 'Let me look.' },
        { type: 'tool_use', id: 'tu_9', name: 'searchEvents', input: { from: '2026-10-01' } },
      ],
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it('maps any other stop reason to "other"', async () => {
    const { client } = fakeClient({
      model: 'claude-haiku-5-5',
      stop_reason: 'refusal',
      content: [],
      usage: { input_tokens: 1, output_tokens: 0 },
    });
    const result = await createAnthropicProvider({ client }).complete({
      tier: 'fast',
      maxTokens: 16,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(result.stopReason).toBe('other');
  });

  it('fails clearly when no API key is configured', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '');
    expect(() => createAnthropicProvider()).toThrow(/ANTHROPIC_API_KEY/);
    vi.unstubAllEnvs();
  });
});
