import Anthropic from '@anthropic-ai/sdk';
import type {
  AiAssistantBlock,
  AiCompletion,
  AiCompletionRequest,
  AiMessage,
  AiProvider,
} from '@/src/server/agent/providers/types';
import { modelForTier } from '@/src/server/agent/router/tiers';

// Only the slice of the SDK this provider uses, so tests can inject a fake.
export interface AnthropicMessagesClient {
  messages: {
    create(params: Anthropic.MessageCreateParamsNonStreaming): Promise<Anthropic.Message>;
  };
}

function toApiMessage(message: AiMessage): Anthropic.MessageParam {
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content.map((block) =>
        block.type === 'text'
          ? { type: 'text', text: block.text }
          : { type: 'tool_use', id: block.id, name: block.name, input: block.input },
      ),
    };
  }
  if (typeof message.content === 'string') return { role: 'user', content: message.content };
  return {
    role: 'user',
    content: message.content.map((block) =>
      block.type === 'text'
        ? { type: 'text', text: block.text }
        : {
            type: 'tool_result',
            tool_use_id: block.toolUseId,
            content: block.content,
            is_error: block.isError,
          },
    ),
  };
}

function fromApiContent(content: Anthropic.ContentBlock[]): AiAssistantBlock[] {
  const blocks: AiAssistantBlock[] = [];
  for (const block of content) {
    if (block.type === 'text') blocks.push({ type: 'text', text: block.text });
    else if (block.type === 'tool_use')
      blocks.push({ type: 'tool_use', id: block.id, name: block.name, input: block.input });
  }
  return blocks;
}

function fromApiStopReason(reason: Anthropic.Message['stop_reason']): AiCompletion['stopReason'] {
  return reason === 'end_turn' || reason === 'tool_use' || reason === 'max_tokens'
    ? reason
    : 'other';
}

export function createAnthropicProvider({
  client,
}: { client?: AnthropicMessagesClient } = {}): AiProvider {
  const api = client ?? defaultClient();
  return {
    async complete(request: AiCompletionRequest): Promise<AiCompletion> {
      const response = await api.messages.create({
        model: modelForTier(request.tier),
        max_tokens: request.maxTokens,
        ...(request.system ? { system: request.system } : {}),
        ...(request.tools?.length
          ? {
              tools: request.tools.map((tool) => ({
                name: tool.name,
                description: tool.description,
                input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
              })),
            }
          : {}),
        messages: request.messages.map(toApiMessage),
      });
      return {
        modelId: response.model,
        stopReason: fromApiStopReason(response.stop_reason),
        content: fromApiContent(response.content),
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
      };
    },
  };
}

function defaultClient(): AnthropicMessagesClient {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error('ANTHROPIC_API_KEY is not set');
  return new Anthropic({ apiKey });
}
