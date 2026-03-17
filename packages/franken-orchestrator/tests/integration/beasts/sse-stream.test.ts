import { describe, it, expect, afterEach } from 'vitest';
import { Hono } from 'hono';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createBeastSseRoutes } from '../../../src/http/routes/beast-sse-routes.js';

describe('Beast SSE routes', () => {
  let ticketStore: SseConnectionTicketStore;

  afterEach(() => {
    ticketStore?.destroy();
  });

  it('POST /v1/beasts/events/ticket returns a ticket', async () => {
    const bus = new BeastEventBus();
    ticketStore = new SseConnectionTicketStore();
    const app = new Hono();
    app.route('/', createBeastSseRoutes({ bus, ticketStore, operatorToken: 'secret-token' }));

    const res = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer secret-token' },
    });

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ticket).toBeDefined();
    expect(typeof body.ticket).toBe('string');
  });

  it('POST /v1/beasts/events/ticket rejects invalid bearer token', async () => {
    const bus = new BeastEventBus();
    ticketStore = new SseConnectionTicketStore();
    const app = new Hono();
    app.route('/', createBeastSseRoutes({ bus, ticketStore, operatorToken: 'secret-token' }));

    const res = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong-token' },
    });

    expect(res.status).toBe(401);
  });

  it('GET /v1/beasts/events/stream rejects invalid ticket', async () => {
    const bus = new BeastEventBus();
    ticketStore = new SseConnectionTicketStore();
    const app = new Hono();
    app.route('/', createBeastSseRoutes({ bus, ticketStore, operatorToken: 'secret-token' }));

    const res = await app.request('/v1/beasts/events/stream?ticket=bogus');

    expect(res.status).toBe(401);
  });
});
