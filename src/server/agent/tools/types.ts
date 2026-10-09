import type { SupabaseClient } from '@supabase/supabase-js';

// Every tool runs under the asker's own Supabase session, never the service
// role, so RLS -- not the tool's code and not the model -- decides which
// rows come back. See PLAN.md "The AI permission boundary".
export interface ToolContext {
  supabase: SupabaseClient;
  userId: string;
  workspaceId: string;
  now?: Date;
}

// A tappable citation the answer UI links back to.
export interface Source {
  kind: 'message' | 'event';
  id: string;
  title: string;
  timestamp: string | null;
  provider: string;
}

export interface ToolResult {
  data: unknown;
  sources: Source[];
  isError: boolean;
}

export interface AgentTool {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
  run(ctx: ToolContext, input: Record<string, unknown>): Promise<Omit<ToolResult, 'isError'>>;
}

// Bad arguments from the model: reported back to it as a tool error so it
// can correct itself, rather than failing the whole request.
export class ToolInputError extends Error {}
