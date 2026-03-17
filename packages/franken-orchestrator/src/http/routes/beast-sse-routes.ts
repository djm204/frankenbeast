import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';
import type { BeastEventBus } from '../../beasts/events/beast-event-bus.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';

export interface BeastSseRouteDeps {
  bus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  operatorToken: string;
}

export function createBeastSseRoutes(deps: BeastSseRouteDeps): Hono {
  const app = new Hono();
  const { bus, ticketStore, operatorToken } = deps;

  app.post('/v1/beasts/events/ticket', (c) => {
    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${operatorToken}`) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' } }, 401);
    }

    const ticket = ticketStore.issue(operatorToken);
    return c.json({ ticket });
  });

  app.get('/v1/beasts/events/stream', (c) => {
    const ticket = c.req.query('ticket');
    if (!ticket || !ticketStore.validate(ticket)) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }

    const lastEventId = c.req.header('Last-Event-ID');

    return streamSSE(c, async (stream) => {
      if (lastEventId) {
        const id = parseInt(lastEventId, 10);
        if (!isNaN(id)) {
          const missed = bus.replaySince(id);
          for (const event of missed) {
            await stream.writeSSE({
              id: String(event.id),
              event: event.type,
              data: JSON.stringify(event.data),
            });
          }
        }
      }

      const unsub = bus.subscribe(async (event) => {
        try {
          await stream.writeSSE({
            id: String(event.id),
            event: event.type,
            data: JSON.stringify(event.data),
          });
        } catch {
          unsub();
        }
      });

      c.req.raw.signal.addEventListener('abort', () => {
        unsub();
      });

      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => resolve());
      });
    });
  });

  return app;
}
