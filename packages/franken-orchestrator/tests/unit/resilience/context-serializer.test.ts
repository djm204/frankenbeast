import { describe, it, expect, afterEach } from 'vitest';
import { join } from 'node:path';
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { promisify } from 'node:util';
import { BeastContext } from '../../../src/context/franken-context.js';
import {
  serializeContext,
  deserializeContext,
  saveContext,
  loadContext,
  ContextSnapshotSizeError,
  ContextSnapshotFileTypeError,
} from '../../../src/resilience/context-serializer.js';

const execFileAsync = promisify(execFile);

describe('ContextSerializer', () => {
  const tmpDirs: string[] = [];
  const fifoIt = process.platform === 'win32' ? it.skip : it;

  afterEach(async () => {
    for (const dir of tmpDirs) {
      await rm(dir, { recursive: true, force: true });
    }
    tmpDirs.length = 0;
  });

  async function tempFile(name: string): Promise<string> {
    const dir = await mkdtemp(join(process.cwd(), '.tmp-context-serializer-'));
    tmpDirs.push(dir);
    return join(dir, name);
  }

  function makeContext(): BeastContext {
    const ctx = new BeastContext('proj-1', 'sess-1', 'Build a feature');
    ctx.phase = 'planning';
    ctx.sanitizedIntent = { goal: 'Build a feature', strategy: 'incremental' };
    ctx.plan = {
      tasks: [
        { id: 't1', objective: 'Step 1', requiredSkills: [], dependsOn: [] },
      ],
    };
    ctx.tokenSpend = { inputTokens: 100, outputTokens: 50, totalTokens: 150, estimatedCostUsd: 0.01 };
    ctx.addAudit('test', 'action', { key: 'value' });
    return ctx;
  }

  it('serializes context to a snapshot', () => {
    const ctx = makeContext();
    const snapshot = serializeContext(ctx);

    expect(snapshot.projectId).toBe('proj-1');
    expect(snapshot.sessionId).toBe('sess-1');
    expect(snapshot.userInput).toBe('Build a feature');
    expect(snapshot.phase).toBe('planning');
    expect(snapshot.sanitizedIntent?.goal).toBe('Build a feature');
    expect(snapshot.plan?.tasks).toHaveLength(1);
    expect(snapshot.tokenSpend.totalTokens).toBe(150);
    expect(snapshot.audit).toHaveLength(1);
    expect(snapshot.savedAt).toBeTruthy();
  });

  it('deserializes snapshot back to context', () => {
    const ctx = makeContext();
    const snapshot = serializeContext(ctx);
    const restored = deserializeContext(snapshot);

    expect(restored.projectId).toBe(ctx.projectId);
    expect(restored.sessionId).toBe(ctx.sessionId);
    expect(restored.userInput).toBe(ctx.userInput);
    expect(restored.phase).toBe(ctx.phase);
    expect(restored.sanitizedIntent).toEqual(ctx.sanitizedIntent);
    expect(restored.plan).toEqual(ctx.plan);
    expect(restored.tokenSpend).toEqual(ctx.tokenSpend);
    expect(restored.audit).toHaveLength(1);
  });

  it('round-trips context through serialize/deserialize', () => {
    const ctx = makeContext();
    const restored = deserializeContext(serializeContext(ctx));

    expect(restored.projectId).toBe(ctx.projectId);
    expect(restored.phase).toBe(ctx.phase);
    expect(restored.plan?.tasks).toEqual(ctx.plan?.tasks);
  });

  it('saves context to file and loads it back', async () => {
    const ctx = makeContext();
    const filePath = await tempFile('beast-ctx-test.json');

    await saveContext(ctx, filePath);
    const restored = await loadContext(filePath);

    expect(restored.projectId).toBe(ctx.projectId);
    expect(restored.sessionId).toBe(ctx.sessionId);
    expect(restored.phase).toBe(ctx.phase);
    expect(restored.plan?.tasks).toEqual(ctx.plan?.tasks);
  });

  it('rejects oversized context snapshot imports before parsing the body', async () => {
    const ctx = makeContext();
    const filePath = await tempFile('beast-ctx-oversized.json');

    await saveContext(ctx, filePath);

    await expect(loadContext(filePath, { maxBytes: 64 })).rejects.toBeInstanceOf(ContextSnapshotSizeError);
    await expect(loadContext(filePath, { maxBytes: 64 })).rejects.toMatchObject({
      name: 'ContextSnapshotSizeError',
      maxBytes: 64,
    });
  });

  it('rejects non-regular context snapshot import paths before reading', async () => {
    const dir = await mkdtemp(join(process.cwd(), '.tmp-context-serializer-non-file-'));
    tmpDirs.push(dir);

    await expect(loadContext(dir)).rejects.toBeInstanceOf(ContextSnapshotFileTypeError);
    await expect(loadContext(dir)).rejects.toMatchObject({
      name: 'ContextSnapshotFileTypeError',
      filePath: dir,
    });
  });

  fifoIt('rejects FIFO context snapshot import paths without waiting for a writer', async () => {
    const dir = await mkdtemp(join(process.cwd(), '.tmp-context-serializer-fifo-'));
    tmpDirs.push(dir);
    const fifoPath = join(dir, 'snapshot.fifo');
    await execFileAsync('mkfifo', [fifoPath]);

    await expect(loadContext(fifoPath)).rejects.toBeInstanceOf(ContextSnapshotFileTypeError);
  });

  it('allows explicit per-import size overrides for trusted large snapshots', async () => {
    const ctx = makeContext();
    const filePath = await tempFile('beast-ctx-large-allowed.json');

    await saveContext(ctx, filePath);
    await expect(loadContext(filePath, { maxBytes: 4096 })).resolves.toMatchObject({
      projectId: ctx.projectId,
      sessionId: ctx.sessionId,
    });
  });

  it('fails closed for invalid context snapshot maxBytes overrides', async () => {
    const filePath = await tempFile('beast-ctx-invalid-limit.json');

    await saveContext(makeContext(), filePath);

    await expect(loadContext(filePath, { maxBytes: 0 })).rejects.toThrow(RangeError);
    await expect(loadContext(filePath, { maxBytes: Number.POSITIVE_INFINITY })).rejects.toThrow(RangeError);
  });

  it('round-trips recovery/error-handling fields', () => {
    const ctx = makeContext();
    ctx.errorContext = [new TypeError('boom')];
    ctx.circuitBreakerTripped = true;
    ctx.critiqueFeedback = 'safety: tighten validation';
    ctx.governorApproval = false;
    ctx.retryCount = 3;
    ctx.checkpointPath = '/tmp/checkpoint.json';

    const snapshot = serializeContext(ctx);
    // Snapshot must be JSON-safe (errors serialized to plain objects).
    const restored = deserializeContext(JSON.parse(JSON.stringify(snapshot)));

    expect(restored.circuitBreakerTripped).toBe(true);
    expect(restored.critiqueFeedback).toBe('safety: tighten validation');
    expect(restored.governorApproval).toBe(false);
    expect(restored.retryCount).toBe(3);
    expect(restored.checkpointPath).toBe('/tmp/checkpoint.json');
    expect(restored.errorContext).toHaveLength(1);
    expect(restored.errorContext?.[0]).toBeInstanceOf(Error);
    expect(restored.errorContext?.[0]?.name).toBe('TypeError');
    expect(restored.errorContext?.[0]?.message).toBe('boom');
  });

  it('handles context with no plan or sanitized intent', () => {
    const ctx = new BeastContext('proj-2', 'sess-2', 'Hello');
    const snapshot = serializeContext(ctx);
    const restored = deserializeContext(snapshot);

    expect(restored.sanitizedIntent).toBeUndefined();
    expect(restored.plan).toBeUndefined();
    expect(restored.phase).toBe('ingestion');
  });
});
