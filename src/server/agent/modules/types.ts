import type { ModelTier } from '@/src/server/agent/providers/types';
import type { ToolName } from '@/src/server/agent/tools';

// One AI skill. The router reads defaultTier/defaultPriority (step 1) and
// description (step 2's classifier); tools[] is the complete list of tools
// the model is offered and allowed to run while this skill is active.
export interface AgentModule {
  name: string;
  nature: string;
  description: string;
  defaultTier: ModelTier;
  defaultPriority: 'interactive' | 'background';
  needs: { sources: Array<'email' | 'calendar' | 'slack'>; crossSource?: boolean };
  permissions: { requiresApproval?: boolean };
  tools: ToolName[];
  instructions: string;
}
