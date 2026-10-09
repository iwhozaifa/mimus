// The provider-neutral shape the agent layer talks to. Anthropic is the only
// implementation today (providers/anthropic.ts); a second provider means a
// second file implementing AiProvider, nothing upstream changes.

export type ModelTier = 'fast' | 'standard' | 'deep';

export interface AiToolDefinition {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type AiAssistantBlock =
  { type: 'text'; text: string } | { type: 'tool_use'; id: string; name: string; input: unknown };

export type AiUserBlock =
  | { type: 'text'; text: string }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean };

export type AiMessage =
  | { role: 'user'; content: string | AiUserBlock[] }
  | { role: 'assistant'; content: AiAssistantBlock[] };

export interface AiUsage {
  inputTokens: number;
  outputTokens: number;
}

export interface AiCompletionRequest {
  tier: ModelTier;
  system?: string;
  messages: AiMessage[];
  tools?: AiToolDefinition[];
  // Force the model to call this tool (e.g. the router's classify tool).
  toolChoice?: { name: string };
  maxTokens: number;
}

export interface AiCompletion {
  modelId: string;
  content: AiAssistantBlock[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'other';
  usage: AiUsage;
}

export interface AiProvider {
  complete(request: AiCompletionRequest): Promise<AiCompletion>;
}
