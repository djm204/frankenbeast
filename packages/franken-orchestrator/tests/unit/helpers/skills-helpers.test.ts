import { describe, it, expect, vi } from 'vitest';
import { makeSkills } from '../../helpers/stubs.js';
import { InMemorySkills } from '../../helpers/in-memory-ports.js';
import type { SkillInput } from '../../../src/deps.js';

describe('makeSkills', () => {
  const input: SkillInput = {
    objective: 'do thing',
    context: { adrs: [], knownErrors: [], rules: [] },
    dependencyOutputs: new Map(),
    sessionId: 'sess',
    projectId: 'proj',
  };

  it('provides execute stub with default result', async () => {
    const skills = makeSkills();
    const result = await skills.execute('any-skill', input);

    expect(result).toEqual({ output: 'mock-output', tokensUsed: 0 });
    expect(skills.execute).toHaveBeenCalledWith('any-skill', input);
  });

  it('allows execute override', async () => {
    const execute = vi.fn(async () => ({ output: 'override', tokensUsed: 1 }));
    const skills = makeSkills({ execute });

    await skills.execute('skill', input);

    expect(execute).toHaveBeenCalledWith('skill', input);
  });
});

describe('InMemorySkills', () => {
  const input: SkillInput = {
    objective: 'Ship it',
    context: { adrs: [], knownErrors: [], rules: [] },
    dependencyOutputs: new Map(),
    sessionId: 'sess',
    projectId: 'proj',
  };

  it('records executions and returns a result', async () => {
    const skills = new InMemorySkills([
      { id: 'alpha', name: 'Alpha', requiresHitl: false, executionType: 'function' },
    ]);

    const result = await skills.execute('alpha', input);

    expect(result).toEqual({ output: 'Executed alpha: Ship it', tokensUsed: 0 });
    expect(skills.executions).toEqual([{ skillId: 'alpha', input }]);
  });

  it('throws when skill is not found', async () => {
    const skills = new InMemorySkills([
      { id: 'alpha', name: 'Alpha', requiresHitl: false, executionType: 'function' },
    ]);

    await expect(skills.execute('missing', input)).rejects.toThrow('Skill not found: missing');
  });

  it('includes executionType on default skills', () => {
    const skills = new InMemorySkills();
    const available = skills.getAvailableSkills();

    for (const skill of available) {
      expect(skill.executionType).toBe('function');
    }
  });
});
