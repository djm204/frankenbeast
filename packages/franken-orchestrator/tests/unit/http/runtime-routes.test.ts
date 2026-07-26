import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { createRuntimeRoutes, runRuntimeEventStream } from '../../../src/http/routes/runtime-routes.js';
import {
  RuntimeAdapterRegistry,
  RuntimeCursorError,
  RuntimeEventPageSchema,
  RuntimeActionResultSchema,
  RuntimeProviderSchema,
  RuntimeSnapshotSchema,
  type RuntimeAdapter,
} from '../../../src/runtime/index.js';
import { RuntimeActionStore } from '../../../src/runtime/runtime-action-store.js';

const stores: SseConnectionTicketStore[] = [];
const actionStores: RuntimeActionStore[] = [];
const tempDirs: string[] = [];

afterEach(async () => {
  stores.splice(0).forEach((store) => store.destroy());
  actionStores.splice(0).forEach((store) => store.destroy());
  await Promise.all(tempDirs.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function runtimeAdapter(): RuntimeAdapter {
  const event = {
    id: 'hermes:global:event:1',
    cursor: 'cursor-1',
    workspaceId: 'hermes:global',
    taskId: 'hermes:global:t_1',
    runId: null,
    type: 'lifecycle' as const,
    occurredAt: '2026-07-26T12:00:00.000Z',
    summary: 'created task event',
    metadata: { source: 'task-event', api_key: 'secret-route-value' },
  };
  return {
    id: 'hermes',
    describe: vi.fn(async () => RuntimeProviderSchema.parse({
      id: 'hermes', runtime: 'hermes', displayName: 'Hermes',
      health: { state: 'connected', checkedAt: '2026-07-26T12:00:00.000Z' },
      capabilities: {
        snapshot: { status: 'supported' }, streaming: { status: 'supported' }, logs: { status: 'supported' },
        blockers: { status: 'supported' }, approvals: { status: 'unsupported', reason: 'No source' },
        pause: { status: 'unsupported', reason: 'Read-only' }, resume: { status: 'unsupported', reason: 'Read-only' },
        cancellation: { status: 'unsupported', reason: 'Read-only' }, policyActions: { status: 'unsupported', reason: 'Read-only' },
      },
      metadata: { token: 'secret-provider-value' },
    })),
    getSnapshot: vi.fn(async () => RuntimeSnapshotSchema.parse({
      providerId: 'hermes', state: 'ready', capturedAt: '2026-07-26T12:00:00.000Z',
      workspaces: { status: 'available', data: [{ id: 'hermes:global', name: 'global', kind: 'workspace', state: 'available' }] },
      agents: { status: 'available', data: [] }, tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] }, events: { status: 'available', data: [event] },
      blockers: { status: 'available', data: [] }, approvals: { status: 'unsupported', reason: 'No source' },
    })),
    getEvents: vi.fn(async ({ cursor } = {}) => RuntimeEventPageSchema.parse(
      cursor ? { events: [], nextCursor: cursor } : { events: [event], nextCursor: event.cursor },
    )),
    executeAction: vi.fn(async (request) => RuntimeActionResultSchema.parse({
      status: 'unsupported',
      providerId: 'hermes',
      correlationId: request.correlationId,
      reason: 'Approval decisions are unavailable',
      audit: {
        requestedBy: 'authenticated-operator',
        actionType: request.action.type,
        targetId: request.action.type === 'approval.resolve' ? request.action.approvalId : request.action.taskId,
        outcome: 'unsupported',
      },
    })),
    validateEventCursor: vi.fn((cursor) => {
      if (cursor === 'malformed') {
        throw Object.assign(new Error('Invalid runtime event cursor'), { code: 'INVALID_CURSOR' });
      }
    }),
  };
}

function createRoutes(actionStore = new RuntimeActionStore()) {
  const ticketStore = new SseConnectionTicketStore();
  stores.push(ticketStore);
  actionStores.push(actionStore);
  const adapter = runtimeAdapter();
  const actionAudit = vi.fn();
  const actionGovernor = { requestApproval: vi.fn(async () => ({ decision: 'approved' as const })) };
  return {
    adapter,
    actionAudit,
    actionGovernor,
    app: createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      pollIntervalMs: 10,
      heartbeatIntervalMs: 20,
      actionAudit,
      actionGovernor,
      actionStore,
    }),
  };
}

function authHeaders(): Record<string, string> {
  return { authorization: 'Bearer operator-secret' };
}

describe('smart-swarm runtime routes', () => {
  it('fails closed through the governor before destructive runtime actions', async () => {
    const { app, adapter, actionGovernor, actionAudit } = createRoutes();
    const describe = await adapter.describe();
    vi.mocked(adapter.describe).mockResolvedValue({
      ...describe,
      capabilities: { ...describe.capabilities, cancellation: { status: 'supported' } },
    });
    actionGovernor.requestApproval.mockResolvedValueOnce({ decision: 'rejected', reason: 'Human approval denied' });

    const response = await app.request('/v1/smart-swarm/providers/hermes/actions', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        idempotencyKey: 'cancel:t_deadbeef:one',
        action: {
          type: 'task.cancel', workspaceId: 'hermes:global', taskId: 'hermes:global:t_deadbeef',
          reason: 'token=must-not-enter-governor',
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: expect.objectContaining({ status: 'rejected' }) });
    expect(actionGovernor.requestApproval).toHaveBeenCalledWith(expect.objectContaining({
      taskId: 'hermes:global:t_deadbeef', requiresHitl: true,
    }));
    expect(JSON.stringify(actionGovernor.requestApproval.mock.calls)).not.toContain('must-not-enter-governor');
    expect(adapter.executeAction).not.toHaveBeenCalled();
    expect(actionAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'rejected' }));
  });

  it('deduplicates concurrent action retries and emits redacted causation-aware audit evidence', async () => {
    const { app, adapter, actionAudit } = createRoutes();
    vi.mocked(adapter.executeAction).mockImplementation(async (request) => RuntimeActionResultSchema.parse({
      status: 'applied',
      providerId: 'hermes',
      correlationId: request.correlationId,
      audit: {
        requestedBy: 'authenticated-operator', actionType: request.action.type,
        targetId: request.action.type === 'approval.resolve' ? request.action.approvalId : request.action.taskId,
        outcome: 'applied', previousState: 'ready', currentState: 'blocked',
      },
    }));
    const body = JSON.stringify({
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      causationId: '018f6f2d-c734-7cc9-b1b6-665544332211',
      idempotencyKey: 'block:t_deadbeef:one',
      action: {
        type: 'blocker.add', workspaceId: 'hermes:global', taskId: 'hermes:global:t_deadbeef',
        category: 'needs-input', reason: 'token=do-not-log',
      },
    });
    const request = () => app.request('/v1/smart-swarm/providers/hermes/actions', {
      method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body,
    });

    const [first, replay] = await Promise.all([request(), request()]);

    expect(first.status).toBe(200);
    expect(replay.status).toBe(200);
    expect(adapter.executeAction).toHaveBeenCalledOnce();
    await expect(replay.json()).resolves.toEqual({ data: expect.objectContaining({ replayed: true }) });
    expect(actionAudit).toHaveBeenCalledOnce();
    expect(actionAudit).toHaveBeenCalledWith(expect.objectContaining({
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      causationId: '018f6f2d-c734-7cc9-b1b6-665544332211',
      actionType: 'blocker.add',
    }));
    expect(JSON.stringify(actionAudit.mock.calls)).not.toContain('do-not-log');
  });

  it('replays completed actions and preserves audit evidence after a server restart', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'runtime-actions-'));
    tempDirs.push(dir);
    const databasePath = join(dir, 'actions.sqlite');
    const firstStore = new RuntimeActionStore({ databasePath });
    const first = createRoutes(firstStore);
    vi.mocked(first.adapter.executeAction).mockImplementation(async (request) => RuntimeActionResultSchema.parse({
      status: 'applied', providerId: 'hermes', correlationId: request.correlationId,
      audit: {
        requestedBy: 'authenticated-operator', actionType: request.action.type,
        targetId: request.action.type === 'approval.resolve' ? request.action.approvalId : request.action.taskId,
        outcome: 'applied', previousState: 'ready', currentState: 'blocked',
      },
    }));
    const body = JSON.stringify({
      correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
      idempotencyKey: 'block:t_deadbeef:durable',
      action: {
        type: 'blocker.add', workspaceId: 'hermes:global', taskId: 'hermes:global:t_deadbeef',
        category: 'transient', reason: 'Retry later',
      },
    });
    const request = (app: ReturnType<typeof createRuntimeRoutes>) => app.request(
      '/v1/smart-swarm/providers/hermes/actions',
      { method: 'POST', headers: { ...authHeaders(), 'content-type': 'application/json' }, body },
    );

    expect((await request(first.app)).status).toBe(200);
    firstStore.destroy();
    actionStores.splice(actionStores.indexOf(firstStore), 1);

    const secondStore = new RuntimeActionStore({ databasePath });
    const second = createRoutes(secondStore);
    const replay = await request(second.app);

    await expect(replay.json()).resolves.toEqual({ data: expect.objectContaining({ status: 'applied', replayed: true }) });
    expect(second.adapter.executeAction).not.toHaveBeenCalled();
    expect(secondStore.listAuditEvents()).toEqual([
      expect.objectContaining({ correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566', outcome: 'applied' }),
    ]);
  });

  it('checks adapter action support and returns a typed unsupported response without side effects', async () => {
    const { app, adapter } = createRoutes();
    const response = await app.request('/v1/smart-swarm/providers/hermes/actions', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        idempotencyKey: 'approval:one',
        action: {
          type: 'approval.resolve',
          workspaceId: 'hermes:global',
          approvalId: 'approval-1',
          decision: 'approve',
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({ status: 'unsupported', correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566' }),
    });
    expect(adapter.executeAction).not.toHaveBeenCalled();
  });

  it('returns a redacted typed failure and audits failed provider mutations', async () => {
    const { app, adapter, actionAudit } = createRoutes();
    vi.mocked(adapter.executeAction).mockRejectedValueOnce(new Error('secret command output API_KEY=do-not-leak'));
    const response = await app.request('/v1/smart-swarm/providers/hermes/actions', {
      method: 'POST',
      headers: { ...authHeaders(), 'content-type': 'application/json' },
      body: JSON.stringify({
        correlationId: '018f6f2d-c734-7cc9-b1b6-112233445566',
        idempotencyKey: 'block:t_deadbeef:failed',
        action: {
          type: 'blocker.add', workspaceId: 'hermes:global', taskId: 'hermes:global:t_deadbeef',
          category: 'transient', reason: 'Retry later',
        },
      }),
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ data: expect.objectContaining({
      status: 'failed', reason: 'Runtime provider action failed',
    }) });
    expect(actionAudit).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'failed' }));
    expect(JSON.stringify(actionAudit.mock.calls)).not.toContain('do-not-leak');
  });

  it('requires operator auth and serves provider-neutral provider and snapshot DTOs', async () => {
    const { app, adapter } = createRoutes();
    expect((await app.request('/v1/smart-swarm/providers')).status).toBe(401);

    const providers = await app.request('/v1/smart-swarm/providers', {
      headers: { authorization: 'Bearer operator-secret' },
    });
    expect(providers.status).toBe(200);
    const providerText = await providers.text();
    expect(JSON.parse(providerText)).toEqual({ data: [expect.objectContaining({ id: 'hermes' })] });
    expect(providerText).not.toContain('secret-provider-value');

    const snapshot = await app.request('/v1/smart-swarm/providers/hermes/snapshot?workspaceId=hermes%3Aglobal&activityLimit=25', {
      headers: { authorization: 'Bearer operator-secret' },
    });
    expect(snapshot.status).toBe(200);
    const snapshotText = await snapshot.text();
    expect(JSON.parse(snapshotText)).toEqual({ data: expect.objectContaining({ providerId: 'hermes' }) });
    expect(snapshotText).not.toContain('secret-route-value');
    expect(adapter.getSnapshot).toHaveBeenCalledWith(expect.objectContaining({
      workspaceId: 'hermes:global',
      activityLimit: 25,
      signal: expect.any(AbortSignal),
    }));
  });

  it('propagates the HTTP request cancellation signal to adapter reads', async () => {
    const { app, adapter } = createRoutes();

    await app.request('/v1/smart-swarm/providers/hermes/snapshot', { headers: authHeaders() });
    await app.request('/v1/smart-swarm/providers/hermes/events', { headers: authHeaders() });

    expect(adapter.getSnapshot).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
    expect(adapter.getEvents).toHaveBeenCalledWith({ signal: expect.any(AbortSignal) });
  });

  it('redacts absolute host paths embedded in provider-neutral response strings', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getSnapshot).mockResolvedValueOnce(RuntimeSnapshotSchema.parse({
      providerId: 'hermes',
      state: 'degraded',
      capturedAt: '2026-07-26T12:00:00.000Z',
      message: 'failed under /home/alice/private-repo during discovery',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'unsupported', reason: 'No source' },
    }));

    const response = await app.request('/v1/smart-swarm/providers/hermes/snapshot', { headers: authHeaders() });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain('/home/alice/private-repo');
    expect(text).toContain('[REDACTED_HOST_PATH]');
  });

  it('redacts file URL host paths embedded in provider-neutral response strings', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getSnapshot).mockResolvedValueOnce(RuntimeSnapshotSchema.parse({
      providerId: 'hermes',
      state: 'degraded',
      capturedAt: '2026-07-26T12:00:00.000Z',
      message: 'failed under file:///home/alice/private-repo during discovery',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'unsupported', reason: 'No source' },
    }));

    const response = await app.request('/v1/smart-swarm/providers/hermes/snapshot', { headers: authHeaders() });
    const text = await response.text();

    expect(response.status).toBe(200);
    expect(text).not.toContain('/home/alice/private-repo');
    expect(text).toContain('[REDACTED_HOST_PATH]');
  });

  it('rejects snapshots whose provider id differs from the selected adapter', async () => {
    const { app, adapter } = createRoutes();
    const snapshot = RuntimeSnapshotSchema.parse({
      providerId: 'other-runtime',
      state: 'empty',
      capturedAt: '2026-07-26T12:00:00.000Z',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'unsupported', reason: 'No source' },
    });
    snapshot.providerId = 'API_KEY=runtime-secret /home/operator/private';
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.mocked(adapter.getSnapshot).mockResolvedValueOnce(snapshot);

    const response = await app.request('/v1/smart-swarm/providers/hermes/snapshot', { headers: authHeaders() });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('runtime-secret');
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('runtime-secret');
    expect(errorSpy.mock.calls.flat().join(' ')).not.toContain('/home/operator/private');
  });

  it('returns a client error when an adapter rejects a malformed cursor', async () => {
    const { app, adapter } = createRoutes();

    const response = await app.request('/v1/smart-swarm/providers/hermes/events?cursor=malformed', {
      headers: authHeaders(),
    });

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error: expect.objectContaining({ code: 'INVALID_CURSOR' }),
    });
    expect(adapter.getEvents).not.toHaveBeenCalled();
  });

  it('redacts adapter cursor error paths before responding', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.validateEventCursor!).mockImplementationOnce(() => {
      throw new RuntimeCursorError('Invalid cursor from /home/alice/runtime.db');
    });

    const validationResponse = await app.request('/v1/smart-swarm/providers/hermes/events?cursor=bad', {
      headers: authHeaders(),
    });
    vi.mocked(adapter.getEvents).mockRejectedValueOnce(
      new RuntimeCursorError('Replay failed in /home/alice/workspace'),
    );
    const readResponse = await app.request('/v1/smart-swarm/providers/hermes/events', {
      headers: authHeaders(),
    });

    const validationBody = JSON.stringify(await validationResponse.json());
    const readBody = JSON.stringify(await readResponse.json());
    expect(validationBody).toContain('[REDACTED_HOST_PATH]');
    expect(readBody).toContain('[REDACTED_HOST_PATH]');
    expect(validationBody).not.toContain('/home/alice');
    expect(readBody).not.toContain('/home/alice');
  });

  it('rejects blank workspace filters across snapshot, events, and stream routes', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const adapter = runtimeAdapter();
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
    });

    const snapshot = await app.request('/v1/smart-swarm/providers/hermes/snapshot?workspaceId=', {
      headers: authHeaders(),
    });
    const events = await app.request('/v1/smart-swarm/providers/hermes/events?workspaceId=', {
      headers: authHeaders(),
    });
    const connectionId = 'blank-workspace';
    const ticket = ticketStore.issue('operator-secret', `hermes:${connectionId}`);
    const stream = await app.request(
      `/v1/smart-swarm/providers/hermes/events/${connectionId}?workspaceId=`,
      { headers: { cookie: `frankenbeast_runtime_sse_ticket=${ticket}` } },
    );

    expect(snapshot.status).toBe(422);
    expect(events.status).toBe(422);
    expect(stream.status).toBe(422);
    expect(adapter.getSnapshot).not.toHaveBeenCalled();
    expect(adapter.getEvents).not.toHaveBeenCalled();
    expect(ticketStore.check(ticket, 'operator-secret', `hermes:${connectionId}`)).toBe('valid');
  });

  it('preserves opaque runtime cursors and identifiers in event responses', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getEvents).mockResolvedValueOnce(RuntimeEventPageSchema.parse({
      events: [{
        id: '/events/123',
        cursor: '/offset/123',
        workspaceId: '/workspaces/alpha',
        taskId: '/tasks/456',
        runId: '/runs/789',
        type: 'lifecycle',
        occurredAt: '2026-07-26T12:00:00.000Z',
        summary: 'opaque cursor event',
        metadata: {},
      }],
      nextCursor: '/offset/123',
    }));

    const response = await app.request('/v1/smart-swarm/providers/hermes/events', { headers: authHeaders() });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        events: [expect.objectContaining({
          id: '/events/123',
          cursor: '/offset/123',
          workspaceId: '/workspaces/alpha',
          taskId: '/tasks/456',
          runId: '/runs/789',
        })],
        nextCursor: '/offset/123',
      }),
    });
  });

  it('preserves secret-like text in opaque runtime contract fields', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getEvents).mockResolvedValueOnce(RuntimeEventPageSchema.parse({
      events: [{
        id: 'event-token=opaque-id',
        cursor: 'token=opaque-cursor',
        workspaceId: 'workspace-token=opaque-workspace',
        taskId: 'task-token=opaque-task',
        runId: 'run-token=opaque-run',
        type: 'lifecycle',
        occurredAt: '2026-07-26T12:00:00.000Z',
        summary: 'opaque cursor event',
        metadata: {},
      }],
      nextCursor: 'token=opaque-cursor',
    }));

    const response = await app.request('/v1/smart-swarm/providers/hermes/events', { headers: authHeaders() });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        events: [expect.objectContaining({
          id: 'event-token=opaque-id',
          cursor: 'token=opaque-cursor',
          workspaceId: 'workspace-token=opaque-workspace',
          taskId: 'task-token=opaque-task',
          runId: 'run-token=opaque-run',
        })],
        nextCursor: 'token=opaque-cursor',
      }),
    });
  });

  it('preserves opaque identifier arrays outside metadata', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getSnapshot).mockResolvedValueOnce(RuntimeSnapshotSchema.parse({
      providerId: 'hermes',
      state: 'ready',
      capturedAt: '2026-07-26T12:00:00.000Z',
      workspaces: { status: 'available', data: [] },
      agents: { status: 'available', data: [] },
      tasks: { status: 'available', data: [{
        id: 'task-1',
        workspaceId: 'workspace-1',
        title: 'opaque relationships',
        state: 'ready',
        parentIds: ['parent-token=opaque-parent'],
        dependencyIds: ['/dependencies/opaque-dependency'],
        ownerIds: ['/home/opaque-owner'],
        priority: null,
        createdAt: '2026-07-26T12:00:00.000Z',
        updatedAt: null,
      }] },
      runs: { status: 'available', data: [] },
      events: { status: 'available', data: [] },
      blockers: { status: 'available', data: [] },
      approvals: { status: 'unsupported', reason: 'No source' },
    }));

    const response = await app.request('/v1/smart-swarm/providers/hermes/snapshot', { headers: authHeaders() });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      data: expect.objectContaining({
        tasks: expect.objectContaining({
          data: [expect.objectContaining({
            parentIds: ['parent-token=opaque-parent'],
            dependencyIds: ['/dependencies/opaque-dependency'],
            ownerIds: ['/home/opaque-owner'],
          })],
        }),
      }),
    });
  });

  it('rate limits unauthenticated stream attempts with a stable bucket', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const adapter = runtimeAdapter();
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 1, windowMs: 60_000 },
    });

    const first = await app.request('/v1/smart-swarm/providers/hermes/events/random-one');
    const second = await app.request('/v1/smart-swarm/providers/hermes/events/random-two');

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);

    const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
      method: 'POST',
      headers: authHeaders(),
    });
    const cookie = ticketResponse.headers.get('set-cookie')!.split(';', 1)[0]!;
    const { connectionId } = await ticketResponse.json() as { connectionId: string };
    const valid = await app.request(`/v1/smart-swarm/providers/hermes/events/${connectionId}`, {
      headers: { cookie },
    });
    expect(valid.status).toBe(200);
    await valid.body!.cancel();

    const secondConnectionId = 'second-valid';
    const secondTicket = ticketStore.issue('operator-secret', `hermes:${secondConnectionId}`);
    const secondValid = await app.request(`/v1/smart-swarm/providers/hermes/events/${secondConnectionId}`, {
      headers: { cookie: `frankenbeast_runtime_sse_ticket=${secondTicket}` },
    });
    expect(secondValid.status).toBe(429);
    expect(ticketStore.check(
      secondTicket,
      'operator-secret',
      `hermes:${secondConnectionId}`,
    )).toBe('valid');
    if (secondValid.body) await secondValid.body.cancel();
  });

  it('rate limits unauthenticated stream attempts before unknown-provider lookup', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 1, windowMs: 60_000 },
    });

    const first = await app.request('/v1/smart-swarm/providers/not-registered/events/random-one');
    const second = await app.request('/v1/smart-swarm/providers/another-provider/events/random-two');

    expect(first.status).toBe(401);
    expect(second.status).toBe(429);
  });

  it('does not let invalid ticket traffic exhaust valid stream admission', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const invalid = await app.request('/v1/smart-swarm/providers/hermes/events/invalid-connection', {
      headers: { cookie: 'frankenbeast_runtime_sse_ticket=invalid-ticket' },
    });
    expect(invalid.status).toBe(401);

    const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
      method: 'POST',
      headers: authHeaders(),
    });
    const cookie = ticketResponse.headers.get('set-cookie')!.split(';', 1)[0]!;
    const { connectionId } = await ticketResponse.json() as { connectionId: string };
    const valid = await app.request(`/v1/smart-swarm/providers/hermes/events/${connectionId}`, {
      headers: { cookie },
    });

    expect(valid.status).toBe(200);
    await valid.body!.cancel();
  });

  it('keeps issued stream-ticket cookies for the browser session', async () => {
    const { app } = createRoutes();

    const response = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.headers.get('set-cookie')).not.toContain('Max-Age');
  });

  it('does not cap an injected stream-ticket cookie at the retention window', async () => {
    const ticketStore = new SseConnectionTicketStore({ consumedRetentionMs: 1_200_000 });
    stores.push(ticketStore);
    const adapter = runtimeAdapter();
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
    });

    const response = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
      method: 'POST',
      headers: authHeaders(),
    });

    expect(response.headers.get('set-cookie')).not.toContain('Max-Age');
  });

  it('refreshes consumed tickets before an injected short retention window expires', async () => {
    vi.useFakeTimers();
    try {
      const ticketStore = new SseConnectionTicketStore({ ttlMs: 30_000, consumedRetentionMs: 1_000 });
      stores.push(ticketStore);
      const refresh = vi.spyOn(ticketStore, 'refreshConsumed');
      const app = createRuntimeRoutes({
        registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
        operatorToken: 'operator-secret',
        security: new TransportSecurityService(),
        ticketStore,
        pollIntervalMs: 60_000,
        heartbeatIntervalMs: 60_000,
      });
      const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
        method: 'POST',
        headers: authHeaders(),
      });
      const cookie = ticketResponse.headers.get('set-cookie')!.split(';', 1)[0]!;
      const { connectionId } = await ticketResponse.json() as { connectionId: string };
      const stream = await app.request(`/v1/smart-swarm/providers/hermes/events/${connectionId}`, {
        headers: { cookie },
      });

      await vi.advanceTimersByTimeAsync(500);

      expect(refresh).toHaveBeenCalled();
      await stream.body!.cancel();
      await vi.advanceTimersByTimeAsync(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('contains transient consumed-ticket refresh failures', async () => {
    vi.useFakeTimers();
    let stream: Response | undefined;
    try {
      const ticketStore = new SseConnectionTicketStore({ consumedRetentionMs: 1_000 });
      stores.push(ticketStore);
      const refresh = vi.spyOn(ticketStore, 'refreshConsumed').mockImplementation(() => {
        throw new Error('SQLITE_BUSY');
      });
      const app = createRuntimeRoutes({
        registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
        operatorToken: 'operator-secret',
        security: new TransportSecurityService(),
        ticketStore,
        pollIntervalMs: 60_000,
        heartbeatIntervalMs: 60_000,
      });
      const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
        method: 'POST',
        headers: authHeaders(),
      });
      const cookie = ticketResponse.headers.get('set-cookie')!.split(';', 1)[0]!;
      const { connectionId } = await ticketResponse.json() as { connectionId: string };
      stream = await app.request(`/v1/smart-swarm/providers/hermes/events/${connectionId}`, {
        headers: { cookie },
      });

      await vi.advanceTimersByTimeAsync(500);
      expect(refresh).toHaveBeenCalled();
    } finally {
      await stream?.body?.cancel().catch(() => {});
      vi.useRealTimers();
    }
  });

  it('rate limits authenticated requests by the verified operator identity', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 1, windowMs: 60_000 },
    });

    const first = await app.request('/v1/smart-swarm/providers', {
      headers: {
        authorization: 'junk-one',
        'x-frankenbeast-operator-token': 'operator-secret',
      },
    });
    const second = await app.request('/v1/smart-swarm/providers', {
      headers: {
        authorization: 'junk-two',
        'x-frankenbeast-operator-token': 'operator-secret',
      },
    });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });

  it('shares an operator rate-limit bucket across dynamic provider paths', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 1, windowMs: 60_000 },
    });

    const first = await app.request('/v1/smart-swarm/providers/unknown-one/snapshot', {
      headers: authHeaders(),
    });
    const second = await app.request('/v1/smart-swarm/providers/unknown-two/snapshot', {
      headers: authHeaders(),
    });

    expect(first.status).toBe(404);
    expect(second.status).toBe(429);
  });

  it('rejects polling intervals above the Node timer maximum', () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);

    expect(() => createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      pollIntervalMs: 2_147_483_648,
    })).toThrow(/pollIntervalMs/);
  });

  it('caps concurrent runtime polling streams', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const adapter = runtimeAdapter();
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 10, windowMs: 60_000 },
      maxActiveStreams: 1,
      pollIntervalMs: 10,
      heartbeatIntervalMs: 20,
    });
    const openStream = async () => {
      const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
        method: 'POST',
        headers: authHeaders(),
      });
      const cookie = ticketResponse.headers.get('set-cookie')!.split(';', 1)[0]!;
      const { connectionId } = await ticketResponse.json() as { connectionId: string };
      const path = `/v1/smart-swarm/providers/hermes/events/${connectionId}`;
      const response = await app.request(path, {
        headers: { cookie },
      });
      return { cookie, path, response };
    };

    const first = await openStream();
    const second = await openStream();

    expect(first.response.status).toBe(200);
    expect(second.response.status).toBe(429);
    await first.response.body!.cancel();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const admittedRetry = await app.request(second.path, {
      headers: { cookie: second.cookie },
    });
    expect(admittedRetry.status).toBe(200);
    await admittedRetry.body!.cancel();
  });

  it('releases stream capacity when the client disconnects during a stalled initial poll', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents)
      .mockImplementationOnce(({ signal } = {}) => new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(signal.reason), { once: true });
      }))
      .mockResolvedValue(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }));
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 10, windowMs: 60_000 },
      maxActiveStreams: 1,
      pollIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });

    const issue = async () => {
      const response = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
        method: 'POST',
        headers: authHeaders(),
      });
      const cookie = response.headers.get('set-cookie')!.split(';', 1)[0]!;
      const { connectionId } = await response.json() as { connectionId: string };
      return { cookie, connectionId };
    };

    const firstTicket = await issue();
    const first = await app.request(`/v1/smart-swarm/providers/hermes/events/${firstTicket.connectionId}`, {
      headers: { cookie: firstTicket.cookie },
    });
    await first.body!.cancel();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const secondTicket = await issue();
    const second = await app.request(`/v1/smart-swarm/providers/hermes/events/${secondTicket.connectionId}`, {
      headers: { cookie: secondTicket.cookie },
    });

    expect(second.status).toBe(200);
    await second.body!.cancel();
  });

  it('keeps stream capacity reserved while a disconnected poll ignores cancellation', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents).mockReturnValue(new Promise(() => {}));
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      maxActiveStreams: 1,
    });
    const issue = async () => {
      const response = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
        method: 'POST',
        headers: authHeaders(),
      });
      const cookie = response.headers.get('set-cookie')!.split(';', 1)[0]!;
      const { connectionId } = await response.json() as { connectionId: string };
      return { cookie, connectionId };
    };
    const firstTicket = await issue();
    const first = await app.request(`/v1/smart-swarm/providers/hermes/events/${firstTicket.connectionId}`, {
      headers: { cookie: firstTicket.cookie },
    });
    await first.body!.cancel();
    await new Promise<void>((resolve) => setImmediate(resolve));

    const secondTicket = await issue();
    const second = await app.request(`/v1/smart-swarm/providers/hermes/events/${secondTicket.connectionId}`, {
      headers: { cookie: secondTicket.cookie },
    });

    expect(second.status).toBe(429);
    await second.body?.cancel();
  });

  it('ends runtime streams when a failure-preserving heartbeat write rejects', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
        events: [],
        nextCursor: null,
      }));
      const pipe = vi.fn().mockRejectedValue(new Error('client disconnected'));
      const stream = { pipe, onAbort: vi.fn() };

      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 20,
        pollIntervalMs: 100,
      });
      await vi.advanceTimersByTimeAsync(20);

      await expect(streamDone).resolves.toBeUndefined();
      expect(pipe).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not queue heartbeats while an earlier stream write is backpressured', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
        events: [],
        nextCursor: null,
      }));
      let releaseWrite!: () => void;
      const stalledWrite = new Promise<void>((resolve) => { releaseWrite = resolve; });
      const pipe = vi.fn()
        .mockImplementationOnce(() => stalledWrite)
        .mockResolvedValue(undefined);
      let abortStream: (() => void) | undefined;
      const stream = {
        pipe,
        onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
      };

      let settled = false;
      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 20,
        pollIntervalMs: 1_000,
      }).finally(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(120);
      expect(pipe).toHaveBeenCalledTimes(1);
      abortStream!();
      await vi.advanceTimersByTimeAsync(0);
      expect(settled).toBe(false);
      releaseWrite();
      await streamDone;
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps the runtime stream pending when a periodic poll ignores cancellation', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      vi.mocked(adapter.getEvents)
        .mockResolvedValueOnce(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }))
        .mockReturnValueOnce(new Promise(() => {}));
      let abortStream: (() => void) | undefined;
      const stream = {
        pipe: vi.fn().mockResolvedValue(undefined),
        onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
      };
      let settled = false;

      void runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 100,
        pollIntervalMs: 20,
      }).finally(() => { settled = true; });
      await vi.advanceTimersByTimeAsync(20);
      const writesBeforeAbort = vi.mocked(stream.pipe).mock.calls.length;
      abortStream!();
      await vi.advanceTimersByTimeAsync(300);
      await Promise.resolve();

      expect(adapter.getEvents).toHaveBeenCalledTimes(2);
      expect(settled).toBe(false);
      expect(stream.pipe).toHaveBeenCalledTimes(writesBeforeAbort);
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries after a transient periodic runtime poll failure', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      vi.mocked(adapter.getEvents)
        .mockResolvedValueOnce(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }))
        .mockRejectedValueOnce(new Error('SQLITE_BUSY'))
        .mockResolvedValue(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }));
      let abortStream: (() => void) | undefined;
      const stream = {
        pipe: vi.fn().mockResolvedValue(undefined),
        onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
      };
      let settled = false;
      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 1_000,
        pollIntervalMs: 20,
      }).finally(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(40);

      expect(adapter.getEvents).toHaveBeenCalledTimes(3);
      expect(settled).toBe(false);
      abortStream!();
      await streamDone;
    } finally {
      vi.useRealTimers();
    }
  });

  it('retries after a transient initial runtime poll failure', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      vi.mocked(adapter.getEvents)
        .mockRejectedValueOnce(new Error('SQLITE_BUSY'))
        .mockResolvedValue(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }));
      let abortStream: (() => void) | undefined;
      const stream = {
        pipe: vi.fn().mockResolvedValue(undefined),
        onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
      };
      let settled = false;
      let failure: unknown;
      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 1_000,
        pollIntervalMs: 20,
      }).then(
        () => { settled = true; },
        (error: unknown) => { settled = true; failure = error; },
      );

      await vi.advanceTimersByTimeAsync(20);

      expect(adapter.getEvents).toHaveBeenCalledTimes(2);
      expect(settled).toBe(false);
      expect(failure).toBeUndefined();
      abortStream!();
      await streamDone;
    } finally {
      vi.useRealTimers();
    }
  });

  it('counts one stalled periodic request as one failure when it rejects', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      let rejectPoll!: (error: Error) => void;
      vi.mocked(adapter.getEvents)
        .mockResolvedValueOnce(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }))
        .mockReturnValueOnce(new Promise((_resolve, reject) => { rejectPoll = reject; }));
      let abortStream: (() => void) | undefined;
      const stream = {
        pipe: vi.fn().mockResolvedValue(undefined),
        onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
      };
      let settled = false;
      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 1_000,
        pollIntervalMs: 20,
      }).finally(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(60);
      expect(adapter.getEvents).toHaveBeenCalledTimes(2);
      rejectPoll(new Error('one slow failure'));
      await vi.advanceTimersByTimeAsync(0);

      expect(settled).toBe(false);
      abortStream!();
      await streamDone;
    } finally {
      vi.useRealTimers();
    }
  });

  it('ends the stream after repeated periodic runtime poll failures', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      vi.mocked(adapter.getEvents)
        .mockResolvedValueOnce(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }))
        .mockRejectedValue(new Error('permanent schema failure'));
      const stream = { pipe: vi.fn().mockResolvedValue(undefined), onAbort: vi.fn() };
      let settled = false;
      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 1_000,
        pollIntervalMs: 20,
      }).finally(() => { settled = true; });

      await vi.advanceTimersByTimeAsync(60);

      expect(adapter.getEvents).toHaveBeenCalledTimes(4);
      expect(settled).toBe(true);
      await streamDone;
    } finally {
      vi.useRealTimers();
    }
  });

  it('starts heartbeats while the initial runtime poll is pending', async () => {
    vi.useFakeTimers();
    try {
      const adapter = runtimeAdapter();
      let releaseInitial!: (page: ReturnType<typeof RuntimeEventPageSchema.parse>) => void;
      vi.mocked(adapter.getEvents).mockReturnValueOnce(new Promise((resolve) => { releaseInitial = resolve; }));
      let abortStream: (() => void) | undefined;
      const pipe = vi.fn().mockResolvedValue(undefined);
      const stream = {
        pipe,
        onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
      };
      const streamDone = runRuntimeEventStream(adapter, stream as never, {
        heartbeatIntervalMs: 20,
        pollIntervalMs: 1_000,
      });

      await vi.advanceTimersByTimeAsync(20);

      expect(pipe).toHaveBeenCalledTimes(1);
      expect(await new Response(pipe.mock.calls[0]![0] as ReadableStream<Uint8Array>).text())
        .toBe('event: heartbeat\ndata: \n\n');
      abortStream!();
      releaseInitial(RuntimeEventPageSchema.parse({ events: [], nextCursor: null }));
      await streamDone;
    } finally {
      vi.useRealTimers();
    }
  });

  it('publishes cursor-only runtime checkpoints to SSE clients', async () => {
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
      events: [],
      nextCursor: 'checkpoint-1',
    }));
    const payloads: string[] = [];
    let abortStream: (() => void) | undefined;
    const stream = {
      pipe: vi.fn(async (body: ReadableStream<Uint8Array>) => {
        payloads.push(await new Response(body).text());
      }),
      onAbort: vi.fn((callback: () => void) => { abortStream = callback; }),
    };

    const streamDone = runRuntimeEventStream(adapter, stream as never, {
      heartbeatIntervalMs: 1_000,
      pollIntervalMs: 1_000,
    });
    await new Promise<void>((resolve) => setImmediate(resolve));
    abortStream!();
    await streamDone;

    expect(payloads).toEqual(['id: checkpoint-1\nevent: checkpoint\ndata: \n\n']);
  });

  it('rejects multiline provider cursors before writing an SSE frame', async () => {
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
      events: [{
        id: 'event-1',
        cursor: 'cursor-1\nevent: forged',
        workspaceId: 'workspace-1',
        taskId: 'task-1',
        runId: null,
        type: 'lifecycle',
        occurredAt: '2026-01-01T00:00:00.000Z',
        summary: 'forged cursor',
        metadata: {},
      }],
      nextCursor: 'cursor-1\nevent: forged',
    }));
    const stream = { pipe: vi.fn(), onAbort: vi.fn() };

    await expect(runRuntimeEventStream(adapter, stream as never, {
      heartbeatIntervalMs: 1_000,
      pollIntervalMs: 1_000,
    })).rejects.toThrow('single-line');
    expect(stream.pipe).not.toHaveBeenCalled();
  });

  it('rejects NUL provider cursors before writing an SSE frame', async () => {
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
      events: [],
      nextCursor: 'cursor-1\0ignored',
    }));
    const stream = {
      pipe: vi.fn().mockRejectedValue(new Error('unexpected stream write')),
      onAbort: vi.fn(),
    };

    await expect(runRuntimeEventStream(adapter, stream as never, {
      heartbeatIntervalMs: 1_000,
      pollIntervalMs: 1_000,
    })).rejects.toThrow('NUL');
    expect(stream.pipe).not.toHaveBeenCalled();
  });

  it('closes polling streams when an adapter returns a permanent failure', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const errorLog = vi.spyOn(console, 'error').mockImplementation(() => {});
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents)
      .mockRejectedValueOnce(new Error('invalid token=secret-value at /home/alice/private/prompt.txt'))
      .mockResolvedValue(RuntimeEventPageSchema.parse({ events: [], nextCursor: 'cursor-1' }));
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 10, windowMs: 60_000 },
      maxActiveStreams: 1,
      pollIntervalMs: 60_000,
      heartbeatIntervalMs: 60_000,
    });
    const issue = async () => {
      const response = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
        method: 'POST',
        headers: authHeaders(),
      });
      const cookie = response.headers.get('set-cookie')!.split(';', 1)[0]!;
      const { connectionId } = await response.json() as { connectionId: string };
      return { cookie, connectionId };
    };

    const failedTicket = await issue();
    await app.request(`/v1/smart-swarm/providers/hermes/events/${failedTicket.connectionId}`, {
      headers: { cookie: failedTicket.cookie },
    });
    await new Promise<void>((resolve) => setImmediate(resolve));

    const retryTicket = await issue();
    const retry = await app.request(`/v1/smart-swarm/providers/hermes/events/${retryTicket.connectionId}`, {
      headers: { cookie: retryTicket.cookie },
    });
    expect(retry.status).toBe(200);
    await retry.body!.cancel();
    expect(errorLog).toHaveBeenCalled();
    const logged = errorLog.mock.calls.flat().map(String).join('\n');
    expect(logged).not.toContain('secret-value');
    expect(logged).not.toContain('/home/alice/private/prompt.txt');
    expect(logged).toContain('<redacted>');
    expect(logged).toContain('[REDACTED_HOST_PATH]');
    errorLog.mockRestore();
  });

  it('rejects a malformed SSE cursor before consuming its one-shot ticket', async () => {
    const { app, adapter } = createRoutes();
    const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
      method: 'POST',
      headers: authHeaders(),
    });
    const cookie = ticketResponse.headers.get('set-cookie')!.split(';', 1)[0]!;
    const { connectionId } = await ticketResponse.json() as { connectionId: string };
    const path = `/v1/smart-swarm/providers/hermes/events/${connectionId}`;
    const rejected = await app.request(`${path}?cursor=malformed`, { headers: { cookie } });
    expect(rejected.status).toBe(422);

    vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({ events: [], nextCursor: null }));
    const retry = await app.request(path, { headers: { cookie } });
    expect(retry.status).toBe(200);
    await retry.body!.cancel();
  });

  it('rate limits malformed cursors presented with a valid stream ticket', async () => {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    const app = createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([runtimeAdapter()]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      rateLimit: { max: 1, windowMs: 60_000 },
    });
    const ticket = ticketStore.issue('operator-secret', 'hermes:malformed-rate-limit');
    const request = () => app.request(
      '/v1/smart-swarm/providers/hermes/events/malformed-rate-limit?cursor=malformed',
      { headers: { cookie: `frankenbeast_runtime_sse_ticket=${ticket}` } },
    );

    expect((await request()).status).toBe(422);
    expect((await request()).status).toBe(429);
    expect(ticketStore.check(ticket, 'operator-secret', 'hermes:malformed-rate-limit')).toBe('valid');
  });

  it('uses one-shot scoped cookies for cursor-replay SSE and emits normalized events', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
      events: [
        {
          id: 'event-1', workspaceId: 'hermes:global', taskId: 'task-1', runId: null, type: 'lifecycle',
          occurredAt: '2026-07-26T12:00:00.000Z', cursor: 'cursor-1', summary: 'first', metadata: {},
        },
        {
          id: 'event-2', workspaceId: 'hermes:global', taskId: 'task-1', runId: null, type: 'lifecycle',
          occurredAt: '2026-07-26T12:00:01.000Z', cursor: 'cursor-2', summary: 'second', metadata: {},
        },
      ],
      nextCursor: 'cursor-final',
    }));
    const ticketResponse = await app.request('/v1/smart-swarm/providers/hermes/events/ticket', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-secret' },
    });
    expect(ticketResponse.status).toBe(200);
    const cookie = ticketResponse.headers.get('set-cookie');
    const { connectionId } = await ticketResponse.json() as { connectionId: string };
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain(`Path=/v1/smart-swarm/providers/hermes/events/${connectionId}`);

    expect((await app.request(`/v1/smart-swarm/providers/hermes/events/${connectionId}`)).status).toBe(401);
    const response = await app.request(`/v1/smart-swarm/providers/hermes/events/${connectionId}`, {
      headers: { cookie: cookie!.split(';', 1)[0]! },
    });
    expect(response.status).toBe(200);
    const reader = response.body!.getReader();
    let output = '';
    while (!output.includes('cursor-final')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += new TextDecoder().decode(chunk.value);
    }
    expect(output).toContain('event: activity');
    expect(output).toContain('id: cursor-1');
    expect(output).toContain('id: cursor-2');
    expect(output).toContain('event: checkpoint');
    expect(output).toContain('id: cursor-final');
    expect(adapter.getEvents).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
    await reader.cancel();
  });

  it('accepts large cursors that a runtime adapter can emit', async () => {
    const { app, adapter } = createRoutes();
    const cursor = 'x'.repeat(70_000);
    const response = await app.request(`/v1/smart-swarm/providers/hermes/events?cursor=${cursor}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
    expect(adapter.getEvents).toHaveBeenCalledWith(expect.objectContaining({
      signal: expect.any(AbortSignal),
    }));
  });

  it('rejects cursors too large for a replay-safe SSE id before writing', async () => {
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents).mockResolvedValue(RuntimeEventPageSchema.parse({
      events: [],
      nextCursor: 'x'.repeat(5_000),
    }));
    const stream = { pipe: vi.fn(), onAbort: vi.fn() };

    await expect(runRuntimeEventStream(adapter, stream as never, {
      heartbeatIntervalMs: 1_000,
      pollIntervalMs: 1_000,
    })).rejects.toThrow('transport-safe');
    expect(stream.pipe).not.toHaveBeenCalled();
  });

  it('measures replay-safe SSE cursor limits in UTF-8 bytes', async () => {
    const adapter = runtimeAdapter();
    vi.mocked(adapter.getEvents)
      .mockResolvedValueOnce(RuntimeEventPageSchema.parse({
        events: [],
        nextCursor: '界'.repeat(2_000),
      }))
      .mockRejectedValue(new Error('permanent poll failure'));
    const stream = { pipe: vi.fn(), onAbort: vi.fn() };

    await expect(runRuntimeEventStream(adapter, stream as never, {
      heartbeatIntervalMs: 1_000,
      pollIntervalMs: 1,
    })).rejects.toThrow('transport-safe');
    expect(stream.pipe).not.toHaveBeenCalled();
  });
});
