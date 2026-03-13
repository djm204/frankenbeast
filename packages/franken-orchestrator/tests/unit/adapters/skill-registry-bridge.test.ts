import { describe, it, expect } from 'vitest';
import { SkillRegistryBridge } from '../../../src/adapters/skill-registry-bridge.js';

interface TestContract {
  skill_id: string;
  metadata: { name: string; description: string; source: string };
  interface: { input_schema: Record<string, unknown>; output_schema: Record<string, unknown> };
  constraints: { is_destructive: boolean; requires_hitl: boolean; sandbox_type: string };
}

function fakeRegistry(skills: TestContract[] = []) {
  return {
    hasSkill: (id: string) => skills.some(s => s.skill_id === id),
    getSkill: (id: string) => skills.find(s => s.skill_id === id),
    getAll: () => skills,
    sync: async () => {},
    isSynced: () => true,
  };
}

const testSkill: TestContract = {
  skill_id: 'test-skill',
  metadata: { name: 'Test Skill', description: 'A test', source: 'LOCAL' },
  interface: { input_schema: {}, output_schema: {} },
  constraints: { is_destructive: false, requires_hitl: true, sandbox_type: 'LOCAL' },
};

describe('SkillRegistryBridge', () => {
  it('delegates hasSkill to the underlying registry', () => {
    const bridge = new SkillRegistryBridge(fakeRegistry([testSkill]));

    expect(bridge.hasSkill('test-skill')).toBe(true);
    expect(bridge.hasSkill('missing')).toBe(false);
  });

  it('maps getSkill to a SkillContract with only the fields the adapter needs', () => {
    const bridge = new SkillRegistryBridge(fakeRegistry([testSkill]));
    const result = bridge.getSkill('test-skill');

    expect(result).toEqual({
      skill_id: 'test-skill',
      metadata: { name: 'Test Skill' },
      constraints: { requires_hitl: true },
    });
  });

  it('returns undefined for unknown skills', () => {
    const bridge = new SkillRegistryBridge(fakeRegistry([]));

    expect(bridge.getSkill('missing')).toBeUndefined();
  });

  it('maps getAll to SkillContract array', () => {
    const second: TestContract = {
      ...testSkill,
      skill_id: 'second',
      metadata: { ...testSkill.metadata, name: 'Second' },
      constraints: { ...testSkill.constraints, requires_hitl: false },
    };
    const bridge = new SkillRegistryBridge(fakeRegistry([testSkill, second]));
    const all = bridge.getAll();

    expect(all).toHaveLength(2);
    expect(all[0]).toEqual({
      skill_id: 'test-skill',
      metadata: { name: 'Test Skill' },
      constraints: { requires_hitl: true },
    });
    expect(all[1]).toEqual({
      skill_id: 'second',
      metadata: { name: 'Second' },
      constraints: { requires_hitl: false },
    });
  });
});
