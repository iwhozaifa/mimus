import {
  createOpenAiProvider,
  type OpenAiResponsesClient,
} from '@/src/server/agent/providers/openai';
import { describe, expect, it, vi } from 'vitest';

// The OpenAI API is a paid external boundary, so it's the one thing mocked
// here: a fake client exposing only responses.create.
function fakeClient(response: unknown) {
  const create = vi.fn(async () => response);
  return { create, client: { responses: { create } } as unknown as OpenAiResponsesClient };
}

function apiResponse(overrides: Record<string, unknown> = {}) {
  return {
    model: 'gpt-6-luna',
    status: 'completed',
    incomplete_details: null,
    output: [],
    usage: { input_tokens: 1, output_tokens: 1 },
    ...overrides,
  };
}

const reasoning = { type: 'reasoning', id: 'rs_1', summary: [], encrypted_content: 'enc' };

describe('openai provider', () => {
  it('sends the tier model, instructions, tools and history in Responses API shape', async () => {
    const { create, client } = fakeClient(apiResponse({ model: 'gpt-6.1-sol' }));
    const provider = createOpenAiProvider({ client });

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
            { type: 'opaque', item: reasoning },
            { type: 'text', text: 'Let me look.' },
            { type: 'tool_use', id: 'call_1', name: 'searchMessages', input: { query: 'x' } },
          ],
        },
        {
          role: 'user',
          content: [
            { type: 'tool_result', toolUseId: 'call_1', content: '[]', isError: false },
            { type: 'text', text: 'also check slack' },
          ],
        },
      ],
    });

    expect(create).toHaveBeenCalledWith({
      model: 'gpt-6.1-sol',
      max_output_tokens: 512,
      store: false,
      include: ['reasoning.encrypted_content'],
      instructions: 'You are Mimus.',
      tools: [
        {
          type: 'function',
          name: 'searchMessages',
          description: 'Search email',
          parameters: { type: 'object', properties: { query: { type: 'string' } } },
          strict: false,
        },
      ],
      input: [
        { role: 'user', content: 'who emailed me?' },
        reasoning,
        { role: 'assistant', content: 'Let me look.' },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'searchMessages',
          arguments: '{"query":"x"}',
        },
        { type: 'function_call_output', call_id: 'call_1', output: '[]' },
        { role: 'user', content: 'also check slack' },
      ],
    });
  });

  it('flags a failed tool result in its output, since the API has no error field', async () => {
    const { create, client } = fakeClient(apiResponse());
    await createOpenAiProvider({ client }).complete({
      tier: 'fast',
      maxTokens: 64,
      messages: [
        {
          role: 'user',
          content: [{ type: 'tool_result', toolUseId: 'call_2', content: 'boom', isError: true }],
        },
      ],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        input: [{ type: 'function_call_output', call_id: 'call_2', output: 'Error: boom' }],
      }),
    );
  });

  it('normalizes the response: reasoning, text and tool calls, stop reason, usage', async () => {
    const { client } = fakeClient(
      apiResponse({
        output: [
          reasoning,
          {
            type: 'message',
            id: 'msg_1',
            role: 'assistant',
            status: 'completed',
            content: [{ type: 'output_text', text: 'Let me look.', annotations: [] }],
          },
          {
            type: 'function_call',
            id: 'fc_1',
            call_id: 'call_9',
            name: 'searchEvents',
            arguments: '{"from":"2026-10-01"}',
          },
        ],
        usage: { input_tokens: 120, output_tokens: 30 },
      }),
    );

    const result = await createOpenAiProvider({ client }).complete({
      tier: 'fast',
      maxTokens: 256,
      messages: [{ role: 'user', content: 'meetings?' }],
    });

    expect(result).toEqual({
      modelId: 'gpt-6-luna',
      stopReason: 'tool_use',
      content: [
        { type: 'opaque', item: reasoning },
        { type: 'text', text: 'Let me look.' },
        { type: 'tool_use', id: 'call_9', name: 'searchEvents', input: { from: '2026-10-01' } },
      ],
      usage: { inputTokens: 120, outputTokens: 30 },
    });
  });

  it('hands malformed tool arguments to the tool as {} so its own validation rejects them', async () => {
    const { client } = fakeClient(
      apiResponse({
        output: [{ type: 'function_call', call_id: 'c', name: 'searchEvents', arguments: '{oops' }],
      }),
    );
    const result = await createOpenAiProvider({ client }).complete({
      tier: 'fast',
      maxTokens: 16,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(result.content).toEqual([
      { type: 'tool_use', id: 'c', name: 'searchEvents', input: {} },
    ]);
  });

  it('forces a specific tool when toolChoice is set', async () => {
    const { create, client } = fakeClient(apiResponse());
    await createOpenAiProvider({ client }).complete({
      tier: 'fast',
      maxTokens: 64,
      tools: [{ name: 'classify', description: 'c', inputSchema: { type: 'object' } }],
      toolChoice: { name: 'classify' },
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ tool_choice: { type: 'function', name: 'classify' } }),
    );
  });

  it('maps completed to end_turn, max_output_tokens to max_tokens, anything else to other', async () => {
    const stopReason = async (overrides: Record<string, unknown>) =>
      (
        await createOpenAiProvider({ client: fakeClient(apiResponse(overrides)).client }).complete({
          tier: 'fast',
          maxTokens: 16,
          messages: [{ role: 'user', content: 'x' }],
        })
      ).stopReason;

    expect(await stopReason({ status: 'completed' })).toBe('end_turn');
    expect(
      await stopReason({
        status: 'incomplete',
        incomplete_details: { reason: 'max_output_tokens' },
      }),
    ).toBe('max_tokens');
    expect(
      await stopReason({ status: 'incomplete', incomplete_details: { reason: 'content_filter' } }),
    ).toBe('other');
    expect(await stopReason({ status: 'failed' })).toBe('other');
  });

  it('reports a dated snapshot under its base model id so it can be priced', async () => {
    const { client } = fakeClient(apiResponse({ model: 'gpt-6.1-sol-2026-09-30' }));
    const result = await createOpenAiProvider({ client }).complete({
      tier: 'standard',
      maxTokens: 16,
      messages: [{ role: 'user', content: 'x' }],
    });
    expect(result.modelId).toBe('gpt-6.1-sol');
  });

  describe('streaming', () => {
    async function* events(...items: unknown[]) {
      yield* items;
    }

    function streamingClient(...items: unknown[]) {
      const create = vi.fn(async () => events(...items));
      return { create, client: { responses: { create } } as unknown as OpenAiResponsesClient };
    }

    const message = (text: string) => ({
      type: 'message',
      id: 'msg_1',
      role: 'assistant',
      status: 'completed',
      content: [{ type: 'output_text', text, annotations: [] }],
    });

    it('forwards text deltas in order and maps the final response like a plain call', async () => {
      const final = apiResponse({ output: [reasoning, message('Hi there')] });
      const { create, client } = streamingClient(
        { type: 'response.created', response: { ...final, status: 'in_progress', output: [] } },
        { type: 'response.output_text.delta', delta: 'Hi', item_id: 'msg_1' },
        { type: 'response.output_text.delta', delta: ' there', item_id: 'msg_1' },
        { type: 'response.completed', response: final },
      );
      const deltas: string[] = [];

      const result = await createOpenAiProvider({ client }).complete({
        tier: 'fast',
        maxTokens: 64,
        messages: [{ role: 'user', content: 'x' }],
        onTextDelta: (text) => deltas.push(text),
      });

      expect(deltas).toEqual(['Hi', ' there']);
      expect(create).toHaveBeenCalledWith(expect.objectContaining({ stream: true }));
      const plain = await createOpenAiProvider({ client: fakeClient(final).client }).complete({
        tier: 'fast',
        maxTokens: 64,
        messages: [{ role: 'user', content: 'x' }],
      });
      expect(result).toEqual(plain);
    });

    it('ends on an incomplete response too', async () => {
      const { client } = streamingClient(
        { type: 'response.output_text.delta', delta: 'Hal', item_id: 'msg_1' },
        {
          type: 'response.incomplete',
          response: apiResponse({
            status: 'incomplete',
            incomplete_details: { reason: 'max_output_tokens' },
            output: [message('Hal')],
          }),
        },
      );
      const result = await createOpenAiProvider({ client }).complete({
        tier: 'fast',
        maxTokens: 1,
        messages: [{ role: 'user', content: 'x' }],
        onTextDelta: () => undefined,
      });
      expect(result.stopReason).toBe('max_tokens');
      expect(result.content).toEqual([{ type: 'text', text: 'Hal' }]);
    });

    it('does not stream when no one is listening for text', async () => {
      const { create, client } = fakeClient(apiResponse());
      await createOpenAiProvider({ client }).complete({
        tier: 'fast',
        maxTokens: 16,
        messages: [{ role: 'user', content: 'x' }],
      });
      expect(create).toHaveBeenCalledWith(expect.not.objectContaining({ stream: true }));
    });

    it('fails if the stream ends without a final response', async () => {
      const { client } = streamingClient({
        type: 'response.output_text.delta',
        delta: 'Hi',
        item_id: 'msg_1',
      });
      await expect(
        createOpenAiProvider({ client }).complete({
          tier: 'fast',
          maxTokens: 16,
          messages: [{ role: 'user', content: 'x' }],
          onTextDelta: () => undefined,
        }),
      ).rejects.toThrow(/without a final response/);
    });
  });

  it('fails clearly when no API key is configured', () => {
    vi.stubEnv('OPENAI_API_KEY', '');
    expect(() => createOpenAiProvider()).toThrow(/OPENAI_API_KEY/);
    vi.unstubAllEnvs();
  });
});
