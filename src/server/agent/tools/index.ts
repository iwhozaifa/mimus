import { draftEmail } from '@/src/server/agent/tools/draftEmail';
import { proposeMeetingTimes } from '@/src/server/agent/tools/proposeMeetingTimes';
import { searchEvents } from '@/src/server/agent/tools/searchEvents';
import { searchMessages } from '@/src/server/agent/tools/searchMessages';
import { slackSearch } from '@/src/server/agent/tools/slackSearch';
import {
  ToolInputError,
  type AgentTool,
  type ToolContext,
  type ToolResult,
} from '@/src/server/agent/tools/types';
import type { AiToolDefinition } from '@/src/server/agent/providers/types';

export type { Source, ToolContext, ToolResult } from '@/src/server/agent/tools/types';

const TOOLS = {
  searchMessages,
  searchEvents,
  slackSearch,
  draftEmail,
  proposeMeetingTimes,
} satisfies Record<string, AgentTool>;

export type ToolName = keyof typeof TOOLS;

// Only the tools a module names are offered to the model...
export function toolDefinitions(allowed: readonly ToolName[]): AiToolDefinition[] {
  return allowed.map((name) => {
    const tool: AgentTool = TOOLS[name];
    return { name: tool.name, description: tool.description, inputSchema: tool.inputSchema };
  });
}

// ...and only those can run, whatever name the model sends back. Failures
// become error results the model can read; nothing about another user's
// data is in them because the tool only ever saw RLS-filtered rows.
export async function runTool(
  allowed: readonly ToolName[],
  name: string,
  input: unknown,
  ctx: ToolContext,
): Promise<ToolResult> {
  if (!(allowed as readonly string[]).includes(name)) {
    return { data: { error: `Tool "${name}" is not available here.` }, sources: [], isError: true };
  }
  const args =
    typeof input === 'object' && input !== null && !Array.isArray(input)
      ? (input as Record<string, unknown>)
      : {};
  try {
    const result = await TOOLS[name as ToolName].run(ctx, args);
    return { ...result, isError: false };
  } catch (err) {
    if (!(err instanceof ToolInputError)) console.error(`[agent] tool ${name} failed`, err);
    const message = err instanceof ToolInputError ? err.message : 'The tool failed.';
    return { data: { error: message }, sources: [], isError: true };
  }
}
