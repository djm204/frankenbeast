import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrainRegistry } from '@franken/brain';

import {
  createBrainInspectionHandle,
  handleBrainCommand,
} from '../../../src/cli/brain-cli.js';

const roots: string[] = [];
const registries: BrainRegistry[] = [];

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'franken-brain-cli-'));
  const brainsDir = join(root, '.fbeast', 'brains');
  const registry = new BrainRegistry(brainsDir);
  roots.push(root);
  registries.push(registry);
  return { root, brainsDir, registry };
}

afterEach(async () => {
  for (const registry of registries.splice(0)) registry.close();
  for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true });
});

describe('handleBrainCommand()', () => {
  it('inspects a consistent snapshot without mutating the source brain database', async () => {
    const { brainsDir, registry } = await fixture();
    const brain = registry.forAgentType('readonly');
    brain.working.set('goal', 'inspect without writes');
    brain.flush();
    registry.close();
    registries.splice(registries.indexOf(registry), 1);
    const sourcePath = join(brainsDir, 'readonly.db');
    const before = await readFile(sourcePath);

    const inspection = await createBrainInspectionHandle(brainsDir, 'readonly');
    try {
      const print = vi.fn();
      await handleBrainCommand({
        action: 'show',
        target: 'readonly',
        registry: inspection.registry,
        print,
      });
      expect(vi.mocked(print).mock.calls[0]?.[0]).toContain('goal');
    } finally {
      await inspection.dispose();
    }

    expect(await readFile(sourcePath)).toEqual(before);
  });

  it('prints the bounded HTTP-compatible brain summary as JSON', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('coder');
    for (let index = 0; index < 105; index += 1) brain.working.set(`key-${String(index).padStart(3, '0')}`, index);
    brain.flush();
    brain.episodic.record({
      type: 'decision',
      summary: 'Used the verified build path',
      createdAt: '2026-07-24T10:00:00.000Z',
    });
    const print = vi.fn();

    await handleBrainCommand({
      action: 'show',
      target: 'coder',
      json: true,
      registry,
      resolveContext: () => ({ faculties: { planning: true, reasoning: false, action: true, learning: true } }),
      print,
    });

    const output = JSON.parse(vi.mocked(print).mock.calls[0]?.[0] as string);
    expect(output.data).toMatchObject({
      agentTypeId: 'coder',
      workingMemory: { total: 105, truncated: true },
      episodic: { eventCount: 1 },
      faculties: {
        planning: { configured: true },
        reasoning: { configured: false },
        action: { configured: true },
        learning: { configured: true },
      },
      lessons: { available: true, count: null },
    });
    expect(output.data.workingMemory.keys).toHaveLength(100);
  });

  it('prints a concise human brain summary by default', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('reviewer');
    brain.working.set('current-goal', 'review safely');
    brain.flush();
    const print = vi.fn();

    await handleBrainCommand({ action: 'show', target: 'reviewer', registry, print });

    const output = vi.mocked(print).mock.calls[0]?.[0] as string;
    expect(output).toContain('Brain: reviewer');
    expect(output).toContain('Working memory: 1 key');
    expect(output).toContain('current-goal');
  });

  it('lists a bounded set of real consolidated lesson candidates', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('builder');
    brain.episodic.record({
      type: 'failure',
      step: 'typecheck',
      summary: 'TypeScript workspace build failed because declarations were stale',
      createdAt: '2026-07-24T10:00:00.000Z',
    });
    brain.learning.consolidate({ threshold: 1, lookback: 10 });
    const print = vi.fn();

    await handleBrainCommand({ action: 'lessons', target: 'builder', json: true, registry, print });

    const output = JSON.parse(vi.mocked(print).mock.calls[0]?.[0] as string);
    expect(output.meta).toMatchObject({ available: true, facultyConfigured: true, limit: 10, truncated: false });
    expect(output.data).toHaveLength(1);
    expect(output.data[0]).toMatchObject({
      status: 'pending',
      kind: 'consolidated-lesson',
      occurrenceCount: 1,
    });
    expect(output.data[0].pattern).toContain('TypeScript workspace build failed');
  });

  it('reports unavailable lessons without inventing records', async () => {
    const { registry } = await fixture();
    registry.forAgentType('planner');
    const print = vi.fn();

    await handleBrainCommand({
      action: 'lessons',
      target: 'planner',
      json: true,
      registry,
      resolveContext: () => ({ faculties: { learning: false } }),
      print,
    });

    const output = JSON.parse(vi.mocked(print).mock.calls[0]?.[0] as string);
    expect(output.data).toEqual([]);
    expect(output.meta).toMatchObject({
      available: false,
      facultyConfigured: false,
      reason: 'Consolidated lessons are not available until the learning faculty is configured',
    });
  });

  it('rejects unsafe identifiers and does not create a brain database', async () => {
    const { brainsDir, registry } = await fixture();

    await expect(handleBrainCommand({ action: 'show', target: '../escape', registry, print: vi.fn() }))
      .rejects.toThrow('Invalid agent type id');
    expect(existsSync(join(brainsDir, 'escape.db'))).toBe(false);
  });

  it('fails clearly when no persisted brain exists and does not create one', async () => {
    const { brainsDir, registry } = await fixture();

    await expect(handleBrainCommand({ action: 'show', target: 'missing', registry, print: vi.fn() }))
      .rejects.toThrow("No persisted brain exists for agent type 'missing'");
    expect(existsSync(join(brainsDir, 'missing.db'))).toBe(false);
  });

  it('requires an action and agent type id', async () => {
    const { registry } = await fixture();
    await expect(handleBrainCommand({ action: undefined, target: undefined, registry, print: vi.fn() }))
      .rejects.toThrow('Usage: frankenbeast brain <show|lessons> <agentTypeId> [--json]');
  });
});
