import { describe, expect, it, vi } from 'vitest';
import {
  RuntimeAdapterRegistry,
  RuntimeAgentSchema,
  RuntimeApprovalSchema,
  RuntimeBlockerSchema,
  RuntimeCursorError,
  RuntimeHealthSchema,
  RuntimeMetadataSchema,
  RuntimeProviderSchema,
  RuntimeActionRequestSchema,
  RuntimeActionResultSchema,
  RuntimeRunSchema,
  RuntimeSnapshotSchema,
  RuntimeTaskSchema,
  RuntimeWorkspaceSchema,
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
    executeAction: vi.fn(async (request) => RuntimeActionResultSchema.parse({
      status: 'unsupported', providerId: id, correlationId: request.correlationId, reason: 'No mutations',
      audit: {
        requestedBy: 'authenticated-operator', actionType: request.action.type,
        targetId: request.action.type === 'approval.resolve' ? request.action.approvalId : request.action.taskId,
        outcome: 'unsupported',
      },
    })),
  };
}

describe('provider-neutral runtime contract', () => {
  it('validates normalized governed action requests and typed unsupported results', () => {
    const request = RuntimeActionRequestSchema.parse({
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      causationId: '018f6f2d-c734-7cc9-b1b6-665544332211',
      idempotencyKey: 'ui:block:t_deadbeef:1',
      action: {
        type: 'blocker.add',
        workspaceId: 'hermes:global',
        taskId: 'hermes:global:t_deadbeef',
        category: 'needs-input',
        reason: 'Operator input is required',
      },
    });

    expect(request.action.type).toBe('blocker.add');
    expect(RuntimeActionResultSchema.parse({
      status: 'unsupported',
      providerId: 'test',
      correlationId: request.correlationId,
      reason: 'Approval decisions are unavailable',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: 'approval.resolve',
        targetId: 'approval-1',
        outcome: 'unsupported',
      },
    })).toEqual(expect.objectContaining({ status: 'unsupported' }));

    expect(RuntimeActionRequestSchema.parse({
      ...request,
      action: { ...request.action, taskId: 'provider/task @ shard 1' },
    }).action).toEqual(expect.objectContaining({ taskId: 'provider/task @ shard 1' }));

    expect(RuntimeActionRequestSchema.parse({
      ...request,
      action: { ...request.action, workspaceId: 'provider/workspace @ shard 1' },
    }).action).toEqual(expect.objectContaining({ workspaceId: 'provider/workspace @ shard 1' }));

    expect(() => RuntimeActionRequestSchema.parse({
      ...request,
      action: { ...request.action, taskId: 'x'.repeat(201) },
    })).toThrow();
  });

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
    expect(orchestrator.RuntimeApprovalSchema).toBe(RuntimeApprovalSchema);
    expect(orchestrator.RuntimeBlockerSchema).toBe(RuntimeBlockerSchema);
    expect(orchestrator.RuntimeHealthSchema).toBe(RuntimeHealthSchema);
    expect(orchestrator.RuntimeMetadataSchema).toBe(RuntimeMetadataSchema);
    expect(orchestrator.RuntimeRunSchema).toBe(RuntimeRunSchema);
    expect(orchestrator.RuntimeSnapshotSchema).toBe(RuntimeSnapshotSchema);
    expect(orchestrator.RuntimeTaskSchema).toBe(RuntimeTaskSchema);
    expect(orchestrator.RuntimeWorkspaceSchema).toBe(RuntimeWorkspaceSchema);
  }, 20_000);
});
