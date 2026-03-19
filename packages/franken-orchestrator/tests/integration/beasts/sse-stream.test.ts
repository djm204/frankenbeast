import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createBeastSseRoutes } from '../../../src/http/routes/beast-sse-routes.js';

const OPERATOR_TOKEN = 'secret-token';

function createSseApp(options?: { getSnapshot?: () => Record<string, unknown> }) {
  const bus = new BeastEventBus();
  const ticketStore = new SseConnectionTicketStore();
  const app = new Hono();
  app.route('/', createBeastSseRoutes({
    bus,
    ticketStore,
    operatorToken: OPERATOR_TOKEN,
    ...(options?.getSnapshot ? { getSnapshot: options.getSnapshot } : {}),
  }));
  return { app, bus, ticketStore };
}

async function issueTicket(app: Hono): Promise<string> {
  const res = await app.request('/v1/beasts/events/ticket', {
    method: 'POST',
    headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` },
  });
  const body = await res.json() as { ticket: string };
  return body.ticket;
}

/**
 * Parse raw SSE text into structured events.
 * Each SSE event block is separated by a blank line.
 */
function parseSseEvents(text: string): Array<{ id?: string; event?: string; data?: string }> {
  const blocks = text.split('\n\n').filter((b) => b.trim().length > 0);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const event: { id?: string; event?: string; data?: string } = {};
    for (const line of lines) {
      if (line.startsWith('id:')) event.id = line.slice(3).trim();
      else if (line.startsWith('event:')) event.event = line.slice(6).trim();
      else if (line.startsWith('data:')) event.data = line.slice(5).trim();
    }
    return event;
  });
}

describe('Beast SSE routes', () => {
  let ticketStore: SseConnectionTicketStore | undefined;

  afterEach(() => {
    ticketStore?.destroy();
    ticketStore = undefined;
  });

  it('POST /v1/beasts/events/ticket returns a ticket', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${OPERATOR_TOKEN}` },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toBeDefined();
    expect(typeof body.ticket).toBe('string');
  });

  it('POST /v1/beasts/events/ticket rejects invalid bearer token', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });

    expect(res.status).toBe(401);
  });

  it('GET /v1/beasts/events/stream rejects invalid ticket', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('/v1/beasts/events/stream?ticket=bogus');

    expect(res.status).toBe(401);
  });

  it('delivers published events to SSE stream', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const ticket = await issueTicket(ctx.app);

    // Schedule events to publish after the stream connects
    setTimeout(() => {
      ctx.bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running' } });
      ctx.bus.publish({ type: 'run.status', data: { runId: 'r1', status: 'active' } });
    }, 30);

    // Abort after events have been delivered
    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);

    const req = new Request('http://localhost/v1/beasts/events/stream?ticket=' + ticket, {
      signal: controller.signal,
    });
    const res = await ctx.app.request(req);
    const text = await res.text();

    const events = parseSseEvents(text);
    const agentEvent = events.find((e) => e.event === 'agent.status');
    const runEvent = events.find((e) => e.event === 'run.status');

    expect(agentEvent).toBeDefined();
    expect(JSON.parse(agentEvent!.data!)).toEqual({ agentId: 'a1', status: 'running' });
    expect(agentEvent!.id).toBe('1');

    expect(runEvent).toBeDefined();
    expect(JSON.parse(runEvent!.data!)).toEqual({ runId: 'r1', status: 'active' });
    expect(runEvent!.id).toBe('2');
  });

  it('sends snapshot event on fresh connect when getSnapshot is provided', async () => {
    const ctx = createSseApp({
      getSnapshot: () => ({ agents: [{ id: 'a1', status: 'idle' }] }),
    });
    ticketStore = ctx.ticketStore;

    const ticket = await issueTicket(ctx.app);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const req = new Request('http://localhost/v1/beasts/events/stream?ticket=' + ticket, {
      signal: controller.signal,
    });
    const res = await ctx.app.request(req);
    const text = await res.text();

    const events = parseSseEvents(text);
    const snapshot = events.find((e) => e.event === 'snapshot');

    expect(snapshot).toBeDefined();
    expect(snapshot!.id).toBe('0');
    expect(JSON.parse(snapshot!.data!)).toEqual({ agents: [{ id: 'a1', status: 'idle' }] });
  });

  it('replays missed events via Last-Event-ID header', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    // Publish events BEFORE connecting — these go into the replay buffer
    ctx.bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running' } }); // id=1
    ctx.bus.publish({ type: 'run.status', data: { runId: 'r1', status: 'active' } });       // id=2
    ctx.bus.publish({ type: 'run.log', data: { runId: 'r1', line: 'hello' } });              // id=3

    const ticket = await issueTicket(ctx.app);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    // Reconnect with Last-Event-ID=1 — should replay events 2 and 3
    const req = new Request('http://localhost/v1/beasts/events/stream?ticket=' + ticket, {
      signal: controller.signal,
      headers: { 'Last-Event-ID': '1' },
    });
    const res = await ctx.app.request(req);
    const text = await res.text();

    const events = parseSseEvents(text);

    // Should NOT contain event id=1 (already seen)
    expect(events.find((e) => e.id === '1')).toBeUndefined();
    // Should contain events 2 and 3
    expect(events.find((e) => e.id === '2')).toBeDefined();
    expect(events.find((e) => e.id === '3')).toBeDefined();
  });

  it('does not send snapshot on reconnect with Last-Event-ID', async () => {
    const ctx = createSseApp({
      getSnapshot: () => ({ agents: [] }),
    });
    ticketStore = ctx.ticketStore;

    const ticket = await issueTicket(ctx.app);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 100);

    const req = new Request('http://localhost/v1/beasts/events/stream?ticket=' + ticket, {
      signal: controller.signal,
      headers: { 'Last-Event-ID': '0' },
    });
    const res = await ctx.app.request(req);
    const text = await res.text();

    const events = parseSseEvents(text);
    expect(events.find((e) => e.event === 'snapshot')).toBeUndefined();
  });

  it('assigns monotonically increasing event IDs', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const ticket = await issueTicket(ctx.app);

    setTimeout(() => {
      for (let i = 0; i < 5; i++) {
        ctx.bus.publish({ type: 'run.log', data: { line: `line-${i}` } });
      }
    }, 30);

    const controller = new AbortController();
    setTimeout(() => controller.abort(), 150);

    const req = new Request('http://localhost/v1/beasts/events/stream?ticket=' + ticket, {
      signal: controller.signal,
    });
    const res = await ctx.app.request(req);
    const text = await res.text();

    const events = parseSseEvents(text).filter((e) => e.id && e.event === 'run.log');
    expect(events.length).toBe(5);

    const ids = events.map((e) => parseInt(e.id!, 10));
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1]! + 1);
    }
  });
});
