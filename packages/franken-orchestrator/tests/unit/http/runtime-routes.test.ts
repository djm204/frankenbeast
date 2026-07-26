import { afterEach, describe, expect, it, vi } from 'vitest';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { createRuntimeRoutes } from '../../../src/http/routes/runtime-routes.js';
import {
  RuntimeAdapterRegistry,
  RuntimeEventPageSchema,
  RuntimeActionResultSchema,
  RuntimeProviderSchema,
  RuntimeSnapshotSchema,
  type RuntimeAdapter,
} from '../../../src/runtime/index.js';

const stores: SseConnectionTicketStore[] = [];

afterEach(() => {
  stores.splice(0).forEach((store) => store.destroy());
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

function createRoutes() {
  const ticketStore = new SseConnectionTicketStore();
  stores.push(ticketStore);
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
    expect(adapter.getSnapshot).toHaveBeenCalledWith({ workspaceId: 'hermes:global', activityLimit: 25 });
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

  it('rejects snapshots whose provider id differs from the selected adapter', async () => {
    const { app, adapter } = createRoutes();
    vi.mocked(adapter.getSnapshot).mockResolvedValueOnce(RuntimeSnapshotSchema.parse({
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
    }));

    const response = await app.request('/v1/smart-swarm/providers/hermes/snapshot', { headers: authHeaders() });

    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('other-runtime');
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
    while (!output.includes('cursor-2')) {
      const chunk = await reader.read();
      if (chunk.done) break;
      output += new TextDecoder().decode(chunk.value);
    }
    expect(output).toContain('event: activity');
    expect(output).toContain('id: cursor-1');
    expect(output).toContain('id: cursor-2');
    expect(output).not.toContain('id: cursor-final');
    await reader.cancel();
  });

  it('accepts large cursors that a runtime adapter can emit', async () => {
    const { app } = createRoutes();
    const cursor = 'x'.repeat(70_000);
    const response = await app.request(`/v1/smart-swarm/providers/hermes/events?cursor=${cursor}`, {
      headers: authHeaders(),
    });
    expect(response.status).toBe(200);
  });
});
