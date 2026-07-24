import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BrainRegistry, SqliteBrain } from '../../src/index.js';

describe('BrainRegistry', () => {
  it('returns one stable brain per agent type within the registry', () => {
    const registry = new BrainRegistry();

    const coder = registry.forAgentType('coder', ':memory:');
    const sameCoder = registry.forAgentType('coder', ':memory:');
    const reviewer = registry.forAgentType('reviewer', ':memory:');

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
      'a'.repeat(245),
    ]) {
      expect(() => registry.forAgentType(id)).toThrow(RangeError);
    }
  });

  it('persists episodic history per agent type across registry lifetimes', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-brain-registry-'));
    const brainsDir = join(root, '.fbeast', 'brains');

    try {
      const firstRegistry = new BrainRegistry(brainsDir);
      const firstCoder = firstRegistry.forAgentType('coder');
      firstCoder.episodic.record({
        type: 'observation',
        summary: 'Coder history survives process-local registry replacement',
        createdAt: new Date().toISOString(),
      });
      firstRegistry.close();

      expect(existsSync(join(brainsDir, 'coder.db'))).toBe(true);

      const secondRegistry = new BrainRegistry(brainsDir);
      try {
        expect(secondRegistry.forAgentType('coder').episodic.count()).toBe(1);
        expect(secondRegistry.forAgentType('reviewer').episodic.count()).toBe(0);
      } finally {
        secondRegistry.close();
      }
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('keeps explicit in-memory agent brains ephemeral', () => {
    const firstRegistry = new BrainRegistry();
    firstRegistry.forAgentType('coder', ':memory:').episodic.record({
      type: 'observation',
      summary: 'Explicit opt-out remains ephemeral',
      createdAt: new Date().toISOString(),
    });
    firstRegistry.close();

    const secondRegistry = new BrainRegistry();
    try {
      expect(secondRegistry.forAgentType('coder', ':memory:').episodic.count()).toBe(0);
    } finally {
      secondRegistry.close();
    }
  });

  it('retains the full registry identifier limit for explicit database paths', () => {
    const registry = new BrainRegistry();
    try {
      const id = 'a'.repeat(255);
      const brain = registry.forAgentType(id, ':memory:');
      expect(registry.forAgentType(id)).toBe(brain);
    } finally {
      registry.close();
    }
  });

  it('reports the actual identifier limit for default database filenames', () => {
    const registry = new BrainRegistry();
    try {
      expect(() => registry.forAgentType('a'.repeat(245))).toThrow(
        'agentTypeId must be at most 244 UTF-8 bytes when deriving the default .db filename',
      );
    } finally {
      registry.close();
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