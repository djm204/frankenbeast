import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, rmSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { BrainRegistry, SqliteBrain } from '../../src/index.js';

describe('BrainRegistry', () => {
  it('returns a stable workspace Hive brain without colliding with an agent type', () => {
    const registry = new BrainRegistry();

    try {
      const hive = registry.forWorkspaceHive('workspace-1', ':memory:');

      expect(registry.forWorkspaceHive('workspace-1', ':memory:')).toBe(hive);
      expect(registry.forAgentType('workspace-1', ':memory:')).not.toBe(hive);
    } finally {
      registry.close();
    }
  });

  it('restricts workspace brain directories and SQLite files to the current user', () => {
    if (process.platform === 'win32') return;
    const dir = mkdtempSync(join(tmpdir(), 'brain-registry-permissions-'));
    const registry = new BrainRegistry(dir);
    try {
      registry
        .forWorkspaceHive('secret-workspace')
        .conversations.resolveOrCreate('secret-workspace', 'operator');
      const workspaceDir = join(dir, 'workspaces');
      const dbPath = join(
        workspaceDir,
        `${createHash('sha256').update('secret-workspace').digest('hex')}.db`,
      );

      expect(statSync(workspaceDir).mode & 0o777).toBe(0o700);
      expect(statSync(dbPath).mode & 0o777).toBe(0o600);
      for (const suffix of ['-wal', '-shm']) {
        const sidecar = `${dbPath}${suffix}`;
        if (existsSync(sidecar)) expect(statSync(sidecar).mode & 0o777).toBe(0o600);
      }
    } finally {
      registry.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('enforces the workspace scope and disables conversations on agent-type brains', () => {
    const registry = new BrainRegistry();

    try {
      const hive = registry.forWorkspaceHive('workspace-1', ':memory:');

      expect(() => hive.conversations.resolveOrCreate('workspace-2', 'operator-1')).toThrow(
        'workspace-2 does not match this Hive brain workspace workspace-1',
      );
      expect(() => registry.forAgentType('coder', ':memory:').conversations).toThrow(
        'BrainConversation persistence is only available on workspace Hive brains',
      );
    } finally {
      registry.close();
    }
  });

  it('hashes every previously accepted non-empty project identifier', () => {
    const registry = new BrainRegistry();

    try {
      for (const workspaceId of [' workspace ', 'workspace\0one', 'w'.repeat(1_025)]) {
        expect(registry.forWorkspaceHive(workspaceId, ':memory:')).toBeDefined();
      }
    } finally {
      registry.close();
    }
  });

  it('keeps default workspace databases physically separate from colliding agent filenames', () => {
    const dir = mkdtempSync(join(tmpdir(), 'brain-registry-workspace-path-'));
    const registry = new BrainRegistry(dir);

    try {
      const workspaceId = 'workspace-1';
      const digest = createHash('sha256').update(workspaceId).digest('hex');
      const collidingAgentTypeId = `workspace-hive-${digest}`;

      registry.forWorkspaceHive(workspaceId);
      registry.forAgentType(collidingAgentTypeId);

      expect(existsSync(join(dir, 'workspaces', `${digest}.db`))).toBe(true);
      expect(existsSync(join(dir, `${collidingAgentTypeId}.db`))).toBe(true);
    } finally {
      registry.close();
      rmSync(dir, { recursive: true, force: true });
    }
  });

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

  it('preserves existing handles when an agent type moves to another explicit path', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-brain-registry-path-change-'));
    const registry = new BrainRegistry();
    try {
      const first = registry.forAgentType('coder', join(root, 'first.db'));
      first.working.set('first', true);
      const second = registry.forAgentType('coder', join(root, 'second.db'));
      second.working.set('second', true);

      expect(first.working.get('first')).toBe(true);
      expect(second).not.toBe(first);
      expect(registry.forAgentType('coder')).toBe(second);
      expect(registry.forAgentType('coder', join(root, 'first.db'))).toBe(first);
      expect(registry.forAgentType('coder')).toBe(first);
    } finally {
      registry.close();
      rmSync(root, { recursive: true, force: true });
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

  it('opens only existing default agent brains without creating unknown databases', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-brain-registry-existing-'));
    const brainsDir = join(root, '.fbeast', 'brains');

    try {
      const writer = new BrainRegistry(brainsDir);
      writer.forAgentType('coder').episodic.record({
        type: 'observation',
        summary: 'Ship safe HTTP routes',
        createdAt: new Date().toISOString(),
      });
      writer.close();

      const reader = new BrainRegistry(brainsDir);
      try {
        expect(reader.getAgentType('coder')?.episodic.count()).toBe(1);
        expect(reader.getAgentType('reviewer')).toBeUndefined();
        expect(existsSync(join(brainsDir, 'reviewer.db'))).toBe(false);
        expect(() => reader.getAgentType('../escape')).toThrow(RangeError);
      } finally {
        reader.close();
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
      expect(brain.planning).toMatchObject({ kind: 'planning', configured: false });
      expect(() => brain.planning.recordStepCompleted({
        id: 'not-configured',
        objective: 'Remain inert',
        requiredSkills: [],
        dependsOn: [],
      })).toThrow('Planning faculty is not configured');
      expect(brain.reasoning).toMatchObject({ kind: 'reasoning', configured: false });
      expect(brain.action).toEqual({ kind: 'action', configured: false });
      expect(brain.learning).toMatchObject({
        kind: 'learning',
        configured: true,
        consolidate: expect.any(Function),
        relevantLessons: expect.any(Function),
      });

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

  it('attaches a configured action faculty without replacing the brain', () => {
    const brain = new SqliteBrain();
    const faculty = {
      kind: 'action' as const,
      configured: true,
      requestApproval: async () => ({ decision: 'approved' as const }),
    };
    try {
      expect(typeof brain.attachActionFaculty).toBe('function');
      brain.attachActionFaculty(faculty);

      expect(brain.action).toBe(faculty);
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