import { AGENT_MODULES } from '@/src/server/agent/modules';
import { describe, expect, it } from 'vitest';

describe('agent modules', () => {
  it('declare the spec fields and only real tools', () => {
    expect(AGENT_MODULES.map((skill) => skill.name)).toEqual([
      'lookup',
      'briefing',
      'draft',
      'schedule',
    ]);
    for (const skill of AGENT_MODULES) {
      expect(skill.tools.length).toBeGreaterThan(0);
      expect(['fast', 'standard', 'deep']).toContain(skill.defaultTier);
      expect(skill.needs.sources.length).toBeGreaterThan(0);
    }
  });

  it('only modules that act on the founder’s behalf can draft, and they require approval', () => {
    for (const skill of AGENT_MODULES) {
      if (skill.tools.includes('draftEmail')) expect(skill.permissions.requiresApproval).toBe(true);
    }
    expect(AGENT_MODULES.find((skill) => skill.name === 'lookup')!.tools).not.toContain(
      'draftEmail',
    );
  });
});
