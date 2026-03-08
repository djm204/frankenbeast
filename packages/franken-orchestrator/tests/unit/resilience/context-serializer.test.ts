import { describe, it, expect, afterEach } from 'vitest';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { unlink } from 'node:fs/promises';
import { BeastContext } from '../../../src/context/franken-context.js';
import {
  serializeContext,
  deserializeContext,
  saveContext,
  loadContext,
} from '../../../src/resilience/context-serializer.js';

describe('ContextSerializer', () => {
  const tmpFiles: string[] = [];

  afterEach(async () => {
    for (const f of tmpFiles) {
      try { await unlink(f); } catch { /* ignore */ }
    }
    tmpFiles.length = 0;
  });

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
    const filePath = join(tmpdir(), `beast-ctx-test-${Date.now()}.json`);
    tmpFiles.push(filePath);

    await saveContext(ctx, filePath);
    const restored = await loadContext(filePath);

    expect(restored.projectId).toBe(ctx.projectId);
    expect(restored.sessionId).toBe(ctx.sessionId);
    expect(restored.phase).toBe(ctx.phase);
    expect(restored.plan?.tasks).toEqual(ctx.plan?.tasks);
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
