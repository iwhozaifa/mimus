import OpenAI from 'openai';
import type {
  AiAssistantBlock,
  AiCompletion,
  AiCompletionRequest,
  AiMessage,
  AiProvider,
} from '@/src/server/agent/providers/types';
import { modelForTier } from '@/src/server/agent/router/tiers';

// Only the slice of the SDK this provider uses, so tests can inject a fake.
export interface OpenAiResponsesClient {
  responses: {
    create(
      params: OpenAI.Responses.ResponseCreateParamsNonStreaming,
    ): Promise<OpenAI.Responses.Response>;
  };
}

// The Responses API, not Chat Completions: on Chat Completions these models
// only call functions with reasoning switched off. Requests are stateless
// (store: false), so each turn's reasoning items come back encrypted, ride
// along in the history as `opaque` blocks and are replayed in order.
function toApiInput(message: AiMessage): OpenAI.Responses.ResponseInputItem[] {
  if (message.role === 'assistant') {
    return message.content.map((block): OpenAI.Responses.ResponseInputItem => {
      if (block.type === 'text') return { role: 'assistant', content: block.text };
      if (block.type === 'tool_use')
        return {
          type: 'function_call',
          call_id: block.id,
          name: block.name,
          arguments: JSON.stringify(block.input),
        };
      return block.item as OpenAI.Responses.ResponseInputItem;
    });
  }
  if (typeof message.content === 'string') return [{ role: 'user', content: message.content }];
  return message.content.map((block): OpenAI.Responses.ResponseInputItem =>
    block.type === 'text'
      ? { role: 'user', content: block.text }
      : {
          type: 'function_call_output',
          call_id: block.toolUseId,
          // The API has no error flag on a tool result, so say it in the output.
          output: block.isError ? `Error: ${block.content}` : block.content,
        },
  );
}

function parseArguments(args: string): unknown {
  try {
    return JSON.parse(args);
  } catch {
    // The tool's own input validation rejects this as missing fields.
    return {};
  }
}

function fromApiOutput(output: OpenAI.Responses.ResponseOutputItem[]): AiAssistantBlock[] {
  const blocks: AiAssistantBlock[] = [];
  for (const item of output) {
    if (item.type === 'message') {
      for (const part of item.content)
        if (part.type === 'output_text') blocks.push({ type: 'text', text: part.text });
    } else if (item.type === 'function_call') {
      blocks.push({
        type: 'tool_use',
        id: item.call_id,
        name: item.name,
        input: parseArguments(item.arguments),
      });
    } else if (item.type === 'reasoning') {
      blocks.push({ type: 'opaque', item });
    }
  }
  return blocks;
}

function fromApiStatus(
  response: OpenAI.Responses.Response,
  content: AiAssistantBlock[],
): AiCompletion['stopReason'] {
  if (response.status === 'incomplete')
    return response.incomplete_details?.reason === 'max_output_tokens' ? 'max_tokens' : 'other';
  if (response.status !== 'completed') return 'other';
  return content.some((block) => block.type === 'tool_use') ? 'tool_use' : 'end_turn';
}

// The API may report a dated snapshot (gpt-6.1-sol-2026-09-30); pricing is
// keyed by the base model id.
function baseModelId(model: string): string {
  return model.replace(/-\d{4}-\d{2}-\d{2}$/, '');
}

export function createOpenAiProvider({
  client,
}: { client?: OpenAiResponsesClient } = {}): AiProvider {
  const api = client ?? defaultClient();
  return {
    async complete(request: AiCompletionRequest): Promise<AiCompletion> {
      const response = await api.responses.create({
        model: modelForTier(request.tier),
        max_output_tokens: request.maxTokens,
        store: false,
        include: ['reasoning.encrypted_content'],
        ...(request.system ? { instructions: request.system } : {}),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                type: 'function' as const,
                name: tool.name,
                description: tool.description,
                parameters: tool.inputSchema,
                // The tool schemas aren't strict-mode shaped (optional
                // fields, no additionalProperties: false).
                strict: false,
              })),
            }
          : {}),
        ...(request.toolChoice
          ? { tool_choice: { type: 'function' as const, name: request.toolChoice.name } }
          : {}),
        input: request.messages.flatMap(toApiInput),
      });
      const content = fromApiOutput(response.output);
      return {
        modelId: baseModelId(response.model),
        stopReason: fromApiStatus(response, content),
        content,
        usage: {
          inputTokens: response.usage?.input_tokens ?? 0,
          outputTokens: response.usage?.output_tokens ?? 0,
        },
      };
    },
  };
}

function defaultClient(): OpenAiResponsesClient {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY is not set');
  return new OpenAI({ apiKey });
}
