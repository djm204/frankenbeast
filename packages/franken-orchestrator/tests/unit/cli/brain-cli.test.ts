import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BrainRegistry } from '@franken/brain';
import Database from 'better-sqlite3';

import { SQLiteBeastRepository } from '../../../src/beasts/repository/sqlite-beast-repository.js';
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
        resolveContext: inspection.resolveContext,
        print,
      });
      expect(vi.mocked(print).mock.calls[0]?.[0]).toContain('goal');
    } finally {
      await inspection.dispose();
    }

    expect(await readFile(sourcePath)).toEqual(before);
  });

  it('reports persisted faculty configuration from the latest established Beast run', async () => {
    const { root, brainsDir, registry } = await fixture();
    registry.forAgentType('faculty-state');
    registry.close();
    registries.splice(registries.indexOf(registry), 1);

    const beastsDb = join(root, '.fbeast', 'beast.db');
    const brainDb = join(brainsDir, 'faculty-state.db');
    const repository = new SQLiteBeastRepository(beastsDb);
    const run = repository.createRun({
      definitionId: 'faculty-state',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: {
        modules: { planner: true, critique: true, governor: false, memory: true },
      },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-25T10:00:00.000Z',
    });
    repository.createAttempt(run.id, {
      status: 'completed',
      startedAt: '2026-07-25T10:00:01.000Z',
    });
    repository.close();
    const beforeBrain = await readFile(brainDb);
    const beforeBeasts = await readFile(beastsDb);

    const inspection = await createBrainInspectionHandle(brainsDir, 'faculty-state');
    try {
      expect(inspection.resolveContext('faculty-state')).toMatchObject({
        faculties: { planning: true, reasoning: true, action: false, learning: true },
      });
      const print = vi.fn();
      await handleBrainCommand({
        action: 'show',
        target: 'faculty-state',
        json: true,
        registry: inspection.registry,
        resolveContext: inspection.resolveContext,
        print,
      });
      expect(JSON.parse(vi.mocked(print).mock.calls[0]?.[0] as string).data.faculties).toEqual({
        planning: { configured: true },
        reasoning: { configured: true },
        action: { configured: false },
        learning: { configured: true },
      });
    } finally {
      await inspection.dispose();
    }
    expect(await readFile(brainDb)).toEqual(beforeBrain);
    expect(await readFile(beastsDb)).toEqual(beforeBeasts);
  });

  it('inspects a portable 255-byte agent id when persisted context provides an explicit brain path', async () => {
    const { root, brainsDir, registry } = await fixture();
    const agentTypeId = 'a'.repeat(255);
    const customBrainDb = join(root, 'custom-brain.db');
    registry.forAgentType(agentTypeId, customBrainDb);
    registry.close();
    registries.splice(registries.indexOf(registry), 1);

    const repository = new SQLiteBeastRepository(join(root, '.fbeast', 'beast.db'));
    const run = repository.createRun({
      definitionId: agentTypeId,
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { brain: { dbPath: customBrainDb } },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-25T10:00:00.000Z',
    });
    repository.createAttempt(run.id, { status: 'completed', startedAt: '2026-07-25T10:00:01.000Z' });
    repository.close();

    const inspection = await createBrainInspectionHandle(brainsDir, agentTypeId);
    try {
      expect(inspection.resolveContext(agentTypeId)?.dbPath).toBeDefined();
      await expect(handleBrainCommand({
        action: 'show',
        target: agentTypeId,
        registry: inspection.registry,
        resolveContext: inspection.resolveContext,
        print: vi.fn(),
      })).resolves.toBeUndefined();
    } finally {
      await inspection.dispose();
    }
  });

  it('reuses one snapshot when the Beast repository is also the configured brain database', async () => {
    const { root, brainsDir, registry } = await fixture();
    registry.close();
    registries.splice(registries.indexOf(registry), 1);
    const sharedDb = join(root, '.fbeast', 'beast.db');
    await mkdir(join(root, '.fbeast'), { recursive: true });
    const sharedBrainRegistry = new BrainRegistry(brainsDir);
    sharedBrainRegistry.forAgentType('shared-database', sharedDb);
    sharedBrainRegistry.close();

    const repository = new SQLiteBeastRepository(sharedDb);
    const run = repository.createRun({
      definitionId: 'shared-database',
      definitionVersion: 1,
      executionMode: 'process',
      configSnapshot: { brain: { dbPath: sharedDb } },
      dispatchedBy: 'api',
      dispatchedByUser: 'operator',
      createdAt: '2026-07-25T10:00:00.000Z',
    });
    repository.createAttempt(run.id, { status: 'completed', startedAt: '2026-07-25T10:00:01.000Z' });
    repository.close();

    const inspection = await createBrainInspectionHandle(brainsDir, 'shared-database');
    try {
      expect(inspection.resolveContext('shared-database')?.dbPath).toMatch(/\/beast\.db$/u);
    } finally {
      await inspection.dispose();
    }
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

  it('bounds checkpoint timestamps and escapes display controls in human output', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('checkpoint-output');
    brain.recovery.checkpoint({
      runId: 'run-checkpoint-output',
      phase: 'execution',
      step: 1,
      context: {},
      timestamp: `trusted\n\u001bspoofed-${'t'.repeat(200)}💥`,
    });
    const jsonPrint = vi.fn();
    const humanPrint = vi.fn();

    await handleBrainCommand({ action: 'show', target: 'checkpoint-output', json: true, registry, print: jsonPrint });
    await handleBrainCommand({ action: 'show', target: 'checkpoint-output', registry, print: humanPrint });

    const timestamp = JSON.parse(vi.mocked(jsonPrint).mock.calls[0]?.[0] as string).data.recovery.lastCheckpointAt;
    expect(Buffer.byteLength(timestamp, 'utf8')).toBeLessThanOrEqual(128);
    expect(timestamp).not.toContain('�');
    const human = vi.mocked(humanPrint).mock.calls[0]?.[0] as string;
    expect(human).not.toContain('\u001b');
    expect(human.split('\n')).toHaveLength(6);
    expect(human).toContain('trusted\\u000a\\u001bspoofed');
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

  it('truncates lesson strings only at complete UTF-8 code point boundaries', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('unicode-lessons');
    brain.memoryReview.propose({
      targetStore: 'working',
      key: `${'k'.repeat(511)}💥tail`,
      value: {
        kind: 'consolidated-lesson',
        pattern: `${'p'.repeat(2047)}💥tail`,
        keywords: [],
        searchTerms: [],
        occurrenceCount: 1,
        confidence: 0.9,
        evidenceEventIds: [],
        firstSeenAt: '2026-07-25T10:00:00.000Z',
        lastSeenAt: '2026-07-25T10:00:00.000Z',
      },
      source: 'operator',
      confidence: 0.9,
      reason: 'Exercise bounded UTF-8 lesson projection.',
    });
    const print = vi.fn();

    await handleBrainCommand({ action: 'lessons', target: 'unicode-lessons', json: true, registry, print });

    const lesson = JSON.parse(vi.mocked(print).mock.calls[0]?.[0] as string).data[0];
    expect(Buffer.byteLength(lesson.key, 'utf8')).toBeLessThanOrEqual(512);
    expect(Buffer.byteLength(lesson.pattern, 'utf8')).toBeLessThanOrEqual(2 * 1024);
    expect(lesson.key).not.toContain('�');
    expect(lesson.pattern).not.toContain('�');
  });

  it('escapes terminal control characters in human lesson output', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('terminal-lessons');
    brain.memoryReview.propose({
      targetStore: 'working',
      key: 'terminal-control',
      value: {
        kind: 'consolidated-lesson',
        pattern: 'trusted line\n\u001b]8;;https://attacker.invalid\u0007spoofed\u202ereordered\u2066isolated',
        keywords: [],
        searchTerms: [],
        occurrenceCount: 1,
        confidence: 0.9,
        evidenceEventIds: [],
        firstSeenAt: '2026-07-25T10:00:00.000Z',
        lastSeenAt: '2026-07-25T10:00:00.000Z',
      },
      source: 'operator',
      confidence: 0.9,
      reason: 'Exercise safe terminal rendering.',
    });
    const print = vi.fn();

    await handleBrainCommand({ action: 'lessons', target: 'terminal-lessons', registry, print });

    const output = vi.mocked(print).mock.calls[0]?.[0] as string;
    expect(output).not.toContain('\u001b');
    expect(output).not.toContain('\u202e');
    expect(output).not.toContain('\u2066');
    expect(output.split('\n')).toHaveLength(2);
    expect(output).toContain(
      'trusted line\\u000a\\u001b]8;;https://attacker.invalid\\u0007spoofed\\u202ereordered\\u2066isolated',
    );
  });

  it('bounds agent-produced lesson timestamps in JSON output', async () => {
    const { registry } = await fixture();
    const brain = registry.forAgentType('timestamp-lessons');
    brain.memoryReview.propose({
      targetStore: 'working',
      key: 'timestamp-bound',
      value: {
        kind: 'consolidated-lesson',
        pattern: 'Bound every projected string.',
        keywords: [],
        searchTerms: [],
        occurrenceCount: 1,
        confidence: 0.9,
        evidenceEventIds: [],
        firstSeenAt: `${'f'.repeat(127)}💥tail`,
        lastSeenAt: 'l'.repeat(1024),
      },
      source: 'operator',
      confidence: 0.9,
      reason: 'Exercise bounded timestamp projection.',
    });
    const print = vi.fn();

    await handleBrainCommand({ action: 'lessons', target: 'timestamp-lessons', json: true, registry, print });

    const lesson = JSON.parse(vi.mocked(print).mock.calls[0]?.[0] as string).data[0];
    expect(Buffer.byteLength(lesson.firstSeenAt, 'utf8')).toBeLessThanOrEqual(128);
    expect(Buffer.byteLength(lesson.lastSeenAt, 'utf8')).toBeLessThanOrEqual(128);
    expect(lesson.firstSeenAt).not.toContain('�');
    expect(lesson).toMatchObject({ firstSeenAtTruncated: true, lastSeenAtTruncated: true });
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

  it('sanitizes storage failures raised while opening an incompatible brain snapshot', async () => {
    const { brainsDir, registry } = await fixture();
    registry.close();
    registries.splice(registries.indexOf(registry), 1);
    await mkdir(brainsDir, { recursive: true });
    const damaged = new Database(join(brainsDir, 'damaged.db'));
    damaged.exec('CREATE TABLE working_memory (not_a_key TEXT)');
    damaged.close();

    const inspection = await createBrainInspectionHandle(brainsDir, 'damaged');
    try {
      await expect(handleBrainCommand({
        action: 'show',
        target: 'damaged',
        registry: inspection.registry,
        resolveContext: inspection.resolveContext,
        print: vi.fn(),
      })).rejects.toThrow('Brain state could not be read');
    } finally {
      await inspection.dispose();
    }
  });

  it('sanitizes failures raised while creating the Beast context snapshot', async () => {
    const { root, brainsDir, registry } = await fixture();
    registry.forAgentType('corrupt-beast-snapshot');
    registry.close();
    registries.splice(registries.indexOf(registry), 1);
    await writeFile(join(root, '.fbeast', 'beast.db'), 'not a sqlite database');

    await expect(createBrainInspectionHandle(brainsDir, 'corrupt-beast-snapshot'))
      .rejects.toThrow('Brain state could not be read');
  });

  it('requires an action and agent type id', async () => {
    const { registry } = await fixture();
    await expect(handleBrainCommand({ action: undefined, target: undefined, registry, print: vi.fn() }))
      .rejects.toThrow('Usage: frankenbeast brain <show|lessons> <agentTypeId> [--json]');
  });
});
