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
  // True for skills that act on the founder's behalf (drafting, sending,
  // booking). Their tools never act beyond the user's approval level
  // (approval_settings, levels 1-4), which the scheduling code enforces.
  permissions: { requiresApproval?: boolean };
  tools: ToolName[];
  instructions: string;
}
