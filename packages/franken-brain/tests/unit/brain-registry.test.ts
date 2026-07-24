import { describe, expect, it } from 'vitest';

import { BrainRegistry, SqliteBrain } from '../../src/index.js';

describe('BrainRegistry', () => {
  it('returns one stable brain per agent type within the registry', () => {
    const registry = new BrainRegistry();

    const coder = registry.forAgentType('coder');
    const sameCoder = registry.forAgentType('coder');
    const reviewer = registry.forAgentType('reviewer');

    try {
      expect(sameCoder).toBe(coder);
      expect(reviewer).not.toBe(coder);
    } finally {
      registry.close();
    }
  });

  it('rejects identifiers that are ambiguous or unsafe as path components', () => {
    const registry = new BrainRegistry();

    for (const id of [
      '',
      ' coder',
      'coder ',
      '.',
      '..',
      'team/coder',
      'team\\coder',
      'coder\0',
      'CON',
      'con.json',
      'COM1',
      'LPT9',
    ]) {
      expect(() => registry.forAgentType(id)).toThrow(RangeError);
    }
  });
});

describe('SqliteBrain faculty foundation', () => {
  it('adds inert faculty surfaces without disturbing memory APIs', () => {
    const brain = new SqliteBrain();
    try {
      expect(brain.planning).toEqual({ kind: 'planning', configured: false });
      expect(brain.reasoning).toMatchObject({ kind: 'reasoning', configured: false });
      expect(brain.action).toEqual({ kind: 'action', configured: false });
      expect(brain.learning).toEqual({ kind: 'learning', configured: false });

      brain.working.set('current-goal', 'keep existing memory consumers working');
      brain.episodic.record({
        type: 'observation',
        summary: 'Faculty surfaces are additive',
        createdAt: new Date().toISOString(),
      });

      expect(brain.working.get('current-goal')).toBe('keep existing memory consumers working');
      expect(brain.episodic.count()).toBe(1);
      expect(brain.serialize().working).toEqual({
        'current-goal': 'keep existing memory consumers working',
      });
    } finally {
      brain.close();
    }
  });

  it('attaches a configured reasoning faculty without replacing the brain', () => {
    const brain = new SqliteBrain();
    const faculty = {
      kind: 'reasoning' as const,
      configured: true,
      reviewPlan: async () => ({ verdict: 'pass' as const, findings: [], score: 1 }),
    };
    try {
      expect(typeof brain.attachReasoningFaculty).toBe('function');
      brain.attachReasoningFaculty(faculty);

      expect(brain.reasoning).toBe(faculty);
      expect(brain.working).toBeDefined();
      expect(brain.episodic).toBeDefined();
    } finally {
      brain.close();
    }
  });

  it('fails closed when the inert reasoning faculty is called', async () => {
    const brain = new SqliteBrain();
    try {
      await expect(brain.reasoning.reviewPlan({ tasks: [] })).rejects.toThrow(
        'Reasoning faculty is not configured',
      );
    } finally {
      brain.close();
    }
  });
});