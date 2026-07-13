import { describe, it, expect, afterEach, vi } from 'vitest';
import { Hono } from 'hono';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createBeastSseRoutes } from '../../../src/http/routes/beast-sse-routes.js';

import { testCredential } from '../../support/test-credentials.js';

const TEST_SECRET_TOKEN = testCredential('TEST_SECRET_TOKEN');
const OPERATOR_TOKEN = TEST_SECRET_TOKEN;
const INVALID_OPERATOR_TOKEN = `${OPERATOR_TOKEN}-invalid`;

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
type ParsedSseEvent = { id?: string; event?: string; data?: string };

function parseSseEvents(text: string): ParsedSseEvent[] {
  const blocks = text.split('\n\n').filter((b) => b.trim().length > 0);
  return blocks.map((block) => {
    const lines = block.split('\n');
    const event: ParsedSseEvent = {};
    for (const line of lines) {
      if (line.startsWith('id:')) event.id = line.slice(3).trim();
      else if (line.startsWith('event:')) event.event = line.slice(6).trim();
      else if (line.startsWith('data:')) event.data = line.slice(5).trim();
    }
    return event;
  });
}

async function readSseEventsUntil(
  app: Hono,
  url: string,
  until: (events: ParsedSseEvent[]) => boolean,
  options: {
    headers?: HeadersInit;
    onConnected?: () => void;
    timeoutMs?: number;
    continueAfterMatchMs?: number;
  } = {},
): Promise<ParsedSseEvent[]> {
  const controller = new AbortController();
  const timeoutSignal = AbortSignal.timeout(options.timeoutMs ?? 1_000);
  let timedOut = false;
  let observedExpectedEvents = false;
  let settleSignal: AbortSignal | undefined;
  const abortOnTimeout = () => {
    timedOut = true;
    controller.abort(timeoutSignal.reason);
  };
  const abortAfterSettling = () => controller.abort(settleSignal?.reason);

  timeoutSignal.addEventListener('abort', abortOnTimeout, { once: true });

  const req = new Request(url, {
    signal: controller.signal,
    headers: options.headers,
  });
  const res = await app.request(req);
  if (!res.body) {
    timeoutSignal.removeEventListener('abort', abortOnTimeout);
    throw new Error('Expected SSE response body to be readable');
  }

  options.onConnected?.();

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = '';

  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      text += decoder.decode(value, { stream: true });
      const events = parseSseEvents(text);
      if (until(events)) {
        if (!observedExpectedEvents && options.continueAfterMatchMs !== undefined) {
          observedExpectedEvents = true;
          settleSignal = AbortSignal.timeout(options.continueAfterMatchMs);
          settleSignal.addEventListener('abort', abortAfterSettling, { once: true });
          continue;
        }
        observedExpectedEvents = true;
        controller.abort();
        return events;
      }
    }
  } catch (error) {
    if (!observedExpectedEvents && !timedOut) {
      throw error;
    }
  } finally {
    timeoutSignal.removeEventListener('abort', abortOnTimeout);
    settleSignal?.removeEventListener('abort', abortAfterSettling);
    reader.releaseLock();
  }

  const finalEvents = parseSseEvents(text);
  if (timedOut) {
    throw new Error(`Timed out waiting for expected SSE events. Received: ${text}`);
  }
  if (!until(finalEvents)) {
    throw new Error(`SSE stream ended before expected events were observed. Received: ${text}`);
  }

  return finalEvents;
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

  it('POST /v1/beasts/events/ticket accepts same-origin operator cookies', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('http://localhost/v1/beasts/events/ticket', {
      method: 'POST',
      headers: {
        cookie: `frankenbeast_operator_token=${OPERATOR_TOKEN}`,
        origin: 'http://localhost',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toBeDefined();
  });

  it('POST /v1/beasts/events/ticket accepts proxied HTTPS same-origin operator cookies', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('http://internal.local/v1/beasts/events/ticket', {
      method: 'POST',
      headers: {
        cookie: `frankenbeast_operator_token=${OPERATOR_TOKEN}`,
        origin: 'https://dashboard.example.com',
        'sec-fetch-site': 'same-origin',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'dashboard.example.com',
      },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toBeDefined();
  });

  it('POST /v1/beasts/events/ticket rejects cross-origin operator cookies', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('http://localhost/v1/beasts/events/ticket', {
      method: 'POST',
      headers: {
        cookie: `frankenbeast_operator_token=${OPERATOR_TOKEN}`,
        origin: 'https://attacker.example',
      },
    });

    expect(res.status).toBe(403);
  });

  it('POST /v1/beasts/events/ticket rejects invalid bearer token', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const res = await ctx.app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: `Bearer ${INVALID_OPERATOR_TOKEN}` },
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

    const events = await readSseEventsUntil(
      ctx.app,
      'http://localhost/v1/beasts/events/stream?ticket=' + ticket,
      (candidateEvents) => (
        candidateEvents.some((e) => e.event === 'agent.status')
        && candidateEvents.some((e) => e.event === 'run.status')
      ),
      {
        onConnected: () => {
          ctx.bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running' } });
          ctx.bus.publish({ type: 'run.status', data: { runId: 'r1', status: 'active' } });
        },
      },
    );
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

    const events = await readSseEventsUntil(
      ctx.app,
      'http://localhost/v1/beasts/events/stream?ticket=' + ticket,
      (candidateEvents) => candidateEvents.some((e) => e.event === 'snapshot'),
    );
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

    // Reconnect with Last-Event-ID=1 — should replay events 2 and 3
    const events = await readSseEventsUntil(
      ctx.app,
      'http://localhost/v1/beasts/events/stream?ticket=' + ticket,
      (candidateEvents) => (
        candidateEvents.some((e) => e.id === '2')
        && candidateEvents.some((e) => e.id === '3')
      ),
      { headers: { 'Last-Event-ID': '1' }, continueAfterMatchMs: 25 },
    );

    // Should NOT contain event id=1 (already seen)
    expect(events.find((e) => e.id === '1')).toBeUndefined();
    // Should contain events 2 and 3
    expect(events.find((e) => e.id === '2')).toBeDefined();
    expect(events.find((e) => e.id === '3')).toBeDefined();
  });

  it('replays missed events via lastEventId query parameter for browser EventSource reconnects', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    ctx.bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running' } });
    ctx.bus.publish({ type: 'run.status', data: { runId: 'r1', status: 'active' } });

    const ticket = await issueTicket(ctx.app);

    const events = await readSseEventsUntil(
      ctx.app,
      `http://localhost/v1/beasts/events/stream?ticket=${ticket}&lastEventId=1`,
      (candidateEvents) => candidateEvents.some((e) => e.id === '2'),
      { continueAfterMatchMs: 25 },
    );

    expect(events.find((e) => e.id === '1')).toBeUndefined();
    expect(events.find((e) => e.id === '2')).toBeDefined();
  });

  it.each<Array<[string, { headers?: HeadersInit; query?: string }]>>([
    ['partial numeric Last-Event-ID header', { headers: { 'Last-Event-ID': '10abc' } }],
    ['non-numeric lastEventId query', { query: 'lastEventId=abc' }],
    ['negative lastEventId query', { query: 'lastEventId=-1' }],
    ['unsafe integer Last-Event-ID header', { headers: { 'Last-Event-ID': '9007199254740992' } }],
  ])('rejects malformed reconnect cursor: %s', async (_label, options) => {
    const getSnapshot = vi.fn(() => ({ agents: [{ id: 'a1', status: 'idle' }] }));
    const ctx = createSseApp({ getSnapshot });
    ticketStore = ctx.ticketStore;

    ctx.bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running' } });

    const ticket = await issueTicket(ctx.app);
    const query = options.query ? `&${options.query}` : '';
    const req = new Request(`http://localhost/v1/beasts/events/stream?ticket=${ticket}${query}`, {
      headers: options.headers,
    });
    const res = await ctx.app.request(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({
      error: {
        code: 'INVALID_LAST_EVENT_ID',
        message: 'Last-Event-ID must be a non-negative safe integer',
      },
    });
    expect(getSnapshot).not.toHaveBeenCalled();
  });

  it('rejects an invalid Last-Event-ID header even when lastEventId query is valid', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const ticket = await issueTicket(ctx.app);
    const req = new Request(`http://localhost/v1/beasts/events/stream?ticket=${ticket}&lastEventId=1`, {
      headers: { 'Last-Event-ID': '1abc' },
    });
    const res = await ctx.app.request(req);

    expect(res.status).toBe(400);
    expect(await res.json()).toMatchObject({ error: { code: 'INVALID_LAST_EVENT_ID' } });
  });

  it('does not send snapshot on reconnect with Last-Event-ID', async () => {
    const ctx = createSseApp({
      getSnapshot: () => ({ agents: [] }),
    });
    ticketStore = ctx.ticketStore;

    ctx.bus.publish({ type: 'agent.status', data: { agentId: 'a1', status: 'running' } });

    const ticket = await issueTicket(ctx.app);

    const events = await readSseEventsUntil(
      ctx.app,
      'http://localhost/v1/beasts/events/stream?ticket=' + ticket,
      (candidateEvents) => candidateEvents.some((e) => e.id === '1'),
      { headers: { 'Last-Event-ID': '0' }, continueAfterMatchMs: 25 },
    );
    expect(events.find((e) => e.event === 'snapshot')).toBeUndefined();
  });

  it('assigns monotonically increasing event IDs', async () => {
    const ctx = createSseApp();
    ticketStore = ctx.ticketStore;

    const ticket = await issueTicket(ctx.app);

    const events = (await readSseEventsUntil(
      ctx.app,
      'http://localhost/v1/beasts/events/stream?ticket=' + ticket,
      (candidateEvents) => candidateEvents.filter((e) => e.event === 'run.log').length === 5,
      {
        onConnected: () => {
          for (let i = 0; i < 5; i++) {
            ctx.bus.publish({ type: 'run.log', data: { line: `line-${i}` } });
          }
        },
      },
    )).filter((e) => e.id && e.event === 'run.log');
    expect(events.length).toBe(5);

    const ids = events.map((e) => parseInt(e.id!, 10));
    for (let i = 1; i < ids.length; i++) {
      expect(ids[i]).toBe(ids[i - 1]! + 1);
    }
  });
});
