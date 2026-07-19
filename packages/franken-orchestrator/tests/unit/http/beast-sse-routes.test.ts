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
    const cookie = ticketRes.headers.get('set-cookie');
    const body = await ticketRes.json() as { connectionId: string };
    expect(cookie).toMatch(/^frankenbeast_sse_ticket=[^;]+;/);
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('SameSite=Strict');
    expect(cookie).toContain('Max-Age=30');
    expect(cookie).toContain(`Path=/v1/beasts/events/stream/${body.connectionId}`);

    const first = await app.request(`/v1/beasts/events/stream/${body.connectionId}`, {
      headers: { cookie: cookie!.split(';', 1)[0]! },
    });
    expect(first.status).toBe(200);
    await first.body?.cancel();

    const second = await app.request(`/v1/beasts/events/stream/${body.connectionId}`, {
      headers: { cookie: cookie!.split(';', 1)[0]! },
    });
    expect(second.status).toBe(204);
    expect(await second.text()).toBe('');
  });

  it('isolates concurrent stream tickets with distinct cookie paths', async () => {
    const app = createRoutes();
    const issue = () => app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-token' },
    });

    const [firstTicketResponse, secondTicketResponse] = await Promise.all([issue(), issue()]);
    const firstBody = await firstTicketResponse.json() as { connectionId: string };
    const secondBody = await secondTicketResponse.json() as { connectionId: string };
    const firstCookie = firstTicketResponse.headers.get('set-cookie');
    const secondCookie = secondTicketResponse.headers.get('set-cookie');

    expect(firstBody.connectionId).not.toBe(secondBody.connectionId);
    expect(firstCookie).toContain(`Path=/v1/beasts/events/stream/${firstBody.connectionId}`);
    expect(secondCookie).toContain(`Path=/v1/beasts/events/stream/${secondBody.connectionId}`);

    const [firstStream, secondStream] = await Promise.all([
      app.request(`/v1/beasts/events/stream/${firstBody.connectionId}`, {
        headers: { cookie: firstCookie!.split(';', 1)[0]! },
      }),
      app.request(`/v1/beasts/events/stream/${secondBody.connectionId}`, {
        headers: { cookie: secondCookie!.split(';', 1)[0]! },
      }),
    ]);

    expect(firstStream.status).toBe(200);
    expect(secondStream.status).toBe(200);
    await Promise.all([firstStream.body?.cancel(), secondStream.body?.cancel()]);
  });

  it('does not accept stream tickets from query strings', async () => {
    const app = createRoutes();
    const ticketRes = await app.request('/v1/beasts/events/ticket', {
      method: 'POST',
      headers: { authorization: 'Bearer operator-token' },
    });
    const cookie = ticketRes.headers.get('set-cookie');
    expect(cookie).toMatch(/^frankenbeast_sse_ticket=[^;]+;/);
    const ticket = cookie!.split(';', 1)[0]!.split('=', 2)[1]!;

    const response = await app.request(`/v1/beasts/events/stream?ticket=${ticket}`);

    expect(response.status).toBe(401);
  });

  it('returns unauthorized for invalid stream tickets', async () => {
    const app = createRoutes();

    const res = await app.request('/v1/beasts/events/stream/connection-1', {
      headers: { cookie: 'frankenbeast_sse_ticket=bogus' },
    });

    expect(res.status).toBe(401);
    const body = await res.json() as { error: { message: string } };
    expect(body.error.message).toBe('Invalid or expired ticket');
  });
});
