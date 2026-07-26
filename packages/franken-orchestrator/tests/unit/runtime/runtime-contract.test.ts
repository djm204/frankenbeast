import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeAdapterRegistry,
  RuntimeAgentSchema,
  RuntimeCursorError,
  RuntimeProviderSchema,
  RuntimeRunSchema,
  RuntimeSnapshotSchema,
  createDefaultRuntimeAdapterRegistry,
  type RuntimeAdapter,
} from '../../../src/runtime/index.js';

function adapter(id: string): RuntimeAdapter {
  return {
    id,
    describe: vi.fn(async () => RuntimeProviderSchema.parse({
      id,
      runtime: 'test-runtime',
      displayName: `Runtime ${id}`,
      health: { state: 'connected', checkedAt: '2026-07-26T12:00:00.000Z' },
      capabilities: {
        snapshot: { status: 'supported' },
        streaming: { status: 'supported' },
        logs: { status: 'unsupported', reason: 'No log source' },
        blockers: { status: 'supported' },
        approvals: { status: 'unsupported', reason: 'No approval source' },
        pause: { status: 'unsupported', reason: 'Read-only adapter' },
        resume: { status: 'unsupported', reason: 'Read-only adapter' },
        cancellation: { status: 'unsupported', reason: 'Read-only adapter' },
        policyActions: { status: 'unsupported', reason: 'Read-only adapter' },
      },
    })),
    getSnapshot: vi.fn(async () => RuntimeSnapshotSchema.parse({
      providerId: id,
      state: 'empty',
      capturedAt: '2026-07-26T12:00:00.000Z',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'unsupported', reason: 'No approval source' },
    })),
    getEvents: vi.fn(async () => ({ events: [], nextCursor: null })),
    validateEventCursor: vi.fn(),
  };
}

describe('provider-neutral runtime contract', () => {
  it('requires every capability to declare supported or unsupported state', async () => {
    const value = adapter('one').describe();
    await expect(value).resolves.toMatchObject({ id: 'one' });

    expect(() => RuntimeProviderSchema.parse({
      id: 'broken',
      runtime: 'test-runtime',
      displayName: 'Broken',
      health: { state: 'connected', checkedAt: '2026-07-26T12:00:00.000Z' },
      capabilities: { snapshot: { status: 'supported' } },
    })).toThrow();
  });

  it('rejects provider storage fields from normalized task DTOs', () => {
    expect(() => RuntimeSnapshotSchema.parse({
      providerId: 'test',
      state: 'ready',
      capturedAt: '2026-07-26T12:00:00.000Z',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: {
        status: 'available',
        data: [{
          id: 'task-1',
          workspaceId: 'workspace-1',
          title: 'Task',
          state: 'ready',
          parentIds: [],
          dependencyIds: [],
          ownerIds: [],
          priority: null,
          createdAt: '2026-07-26T12:00:00.000Z',
          updatedAt: null,
          tableName: 'tasks',
        }],
      },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'unsupported', reason: 'No approval source' },
    })).toThrow();
  });

  it('registers adapters by stable id and rejects ambiguous duplicates', async () => {
    const registry = new RuntimeAdapterRegistry([adapter('alpha'), adapter('beta')]);

    await expect(registry.list()).resolves.toEqual([
      expect.objectContaining({ id: 'alpha' }),
      expect.objectContaining({ id: 'beta' }),
    ]);
    expect(registry.get('alpha').id).toBe('alpha');
    expect(() => registry.get('missing')).toThrow("Runtime adapter 'missing' is not registered");
    expect(() => registry.register(adapter('alpha'))).toThrow("Runtime adapter 'alpha' is already registered");
  });

  it('rejects adapters that cannot prevalidate event cursors', () => {
    const missingValidator = { ...adapter('missing-validator'), validateEventCursor: undefined } as unknown as RuntimeAdapter;
    expect(() => new RuntimeAdapterRegistry([missingValidator]))
      .toThrow(/must implement validateEventCursor/);
  });

  it('rejects adapters whose described provider id differs from their registry id', async () => {
    const mismatched = adapter('foo');
    vi.mocked(mismatched.describe).mockResolvedValue({
      ...await adapter('bar').describe(),
      id: 'bar',
    });
    const registry = new RuntimeAdapterRegistry([mismatched]);
    await expect(registry.list()).rejects.toThrow(/does not match registered id/);
  });

  it('registers Hermes as the first default runtime adapter without inventing availability', async () => {
    const registry = createDefaultRuntimeAdapterRegistry({ env: {} });

    await expect(registry.list()).resolves.toEqual([
      expect.objectContaining({ id: 'hermes', health: expect.objectContaining({ state: 'unavailable' }) }),
    ]);
  });

  it('exports the runtime adapter boundary from the orchestrator package surface', async () => {
    const orchestrator = await import('../../../src/index.js');

    expect(orchestrator.RuntimeAdapterRegistry).toBe(RuntimeAdapterRegistry);
    expect(orchestrator.RuntimeCursorError).toBe(RuntimeCursorError);
    expect(orchestrator.HermesRuntimeAdapter).toEqual(expect.any(Function));
    expect(RuntimeAgentSchema).toEqual(expect.any(Object));
    expect(RuntimeRunSchema).toEqual(expect.any(Object));
    expect(orchestrator.RuntimeAgentSchema).toBe(RuntimeAgentSchema);
    expect(orchestrator.RuntimeRunSchema).toBe(RuntimeRunSchema);
    expect(orchestrator.RuntimeSnapshotSchema).toBe(RuntimeSnapshotSchema);
  }, 20_000);
});
