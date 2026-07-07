import { afterEach, describe, expect, it } from 'vitest';
import { BeastEventBus } from '../../../src/beasts/events/beast-event-bus.js';
import { SseConnectionTicketStore } from '../../../src/beasts/events/sse-connection-ticket.js';
import { createBeastSseRoutes } from '../../../src/http/routes/beast-sse-routes.js';

describe('beast SSE routes', () => {
  const stores: SseConnectionTicketStore[] = [];

  afterEach(() => {
    while (stores.length > 0) {
      stores.pop()?.destroy();
    }
  });

  function createRoutes() {
    const ticketStore = new SseConnectionTicketStore();
    stores.push(ticketStore);
    return createBeastSseRoutes({
      bus: new BeastEventBus(),
      ticketStore,
      operatorToken: 'operator-token',
    });
  }

  it('returns no content for a reused stream ticket so EventSource stops native retries', async () => {
    const app = createRoutes();
    const ticketRes = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-token' },
    });
    const { ticket } = await ticketRes.json() as { ticket: string };

    const first = await app.request(`/v1/beasts/events/stream?ticket=${ticket}`);
    expect(first.status).toBe(200);
    await first.body?.cancel();

    const second = await app.request(`/v1/beasts/events/stream?ticket=${ticket}`);
    expect(second.status).toBe(204);
    expect(await second.text()).toBe('');
  });

  it('returns unauthorized for invalid stream tickets', async () => {
    const app = createRoutes();

    const res = await app.request('/v1/beasts/events/stream?ticket=bogus');

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toBe('Invalid or expired ticket');
  });
});
