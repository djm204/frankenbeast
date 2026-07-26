import { afterEach, describe, expect, it, vi } from 'vitest';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { TransportSecurityService } from '../../../src/http/security/transport-security.js';
import { createRuntimeRoutes } from '../../../src/http/routes/runtime-routes.js';
import {
  RuntimeAdapterRegistry,
  RuntimeEventPageSchema,
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
  };
}

function createRoutes() {
  const ticketStore = new SseConnectionTicketStore();
  stores.push(ticketStore);
  const adapter = runtimeAdapter();
  return {
    adapter,
    app: createRuntimeRoutes({
      registry: new RuntimeAdapterRegistry([adapter]),
      operatorToken: 'operator-secret',
      security: new TransportSecurityService(),
      ticketStore,
      pollIntervalMs: 10,
      heartbeatIntervalMs: 20,
    }),
  };
}

describe('smart-swarm runtime routes', () => {
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

  it('uses one-shot scoped cookies for cursor-replay SSE and emits normalized events', async () => {
    const { app } = createRoutes();
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
    const first = await reader.read();
    expect(new TextDecoder().decode(first.value)).toContain('event: activity');
    expect(new TextDecoder().decode(first.value)).toContain('cursor-1');
    await reader.cancel();
  });
});
