import type { AgentModule } from '@/src/server/agent/modules/types';

export type { AgentModule } from '@/src/server/agent/modules/types';

export const AGENT_MODULES: AgentModule[] = [
  {
    name: 'lookup',
    nature: 'lookup',
    description: 'Find a specific fact in email, calendar or Slack (who, when, what was said).',
    defaultTier: 'fast',
    defaultPriority: 'interactive',
    needs: { sources: ['email', 'calendar', 'slack'] },
    permissions: {},
    tools: ['searchMessages', 'searchEvents', 'slackSearch'],
    instructions: 'Answer the question directly in one to three sentences.',
  },
  {
    name: 'briefing',
    nature: 'summary',
    description:
      'Summarize or prioritize across sources: what needs attention, catch-ups, status of a topic.',
    defaultTier: 'standard',
    defaultPriority: 'interactive',
    needs: { sources: ['email', 'calendar', 'slack'], crossSource: true },
    permissions: {},
    tools: ['searchMessages', 'searchEvents', 'slackSearch'],
    instructions:
      'Search each relevant source, then give a short prioritized summary as bullet points.',
  },
  {
    name: 'draft',
    nature: 'draft',
    description: 'Write or reply to an email on the founder’s behalf (draft only).',
    defaultTier: 'standard',
    defaultPriority: 'interactive',
    needs: { sources: ['email'] },
    permissions: { requiresApproval: true },
    tools: ['searchMessages', 'draftEmail'],
    instructions:
      'Find the message being replied to if there is one, then call draftEmail. Say the draft is ready for review -- it is never sent automatically.',
  },
  {
    name: 'schedule',
    nature: 'scheduling',
    description: 'Find meeting times or check availability.',
    defaultTier: 'standard',
    defaultPriority: 'interactive',
    needs: { sources: ['calendar', 'email'] },
    permissions: { requiresApproval: true },
    tools: ['searchEvents', 'searchMessages', 'proposeMeetingTimes'],
    instructions:
      'Use proposeMeetingTimes for free slots and present two or three options. Nothing is booked automatically.',
  },
];
