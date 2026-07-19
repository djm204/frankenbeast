import { randomUUID, timingSafeEqual } from 'node:crypto';
import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { streamSSE } from 'hono/streaming';
import type { BeastEventBus } from '../../beasts/events/beast-event-bus.js';
import type { SseConnectionTicketStore } from '../../beasts/events/sse-connection-ticket.js';
import { extractOperatorToken, extractOperatorTokenCookie, isCookieOperatorAuthAllowed } from '../operator-auth.js';

const SSE_TICKET_COOKIE = 'frankenbeast_sse_ticket';
const SSE_STREAM_PATH = '/v1/beasts/events/stream';

function connectionStreamPath(connectionId: string): string {
  return `${SSE_STREAM_PATH}/${connectionId}`;
}

function isHttpsRequest(
  requestUrl: string,
  forwardedProto: string | undefined,
): boolean {
  const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  return proto ? proto === 'https' : new URL(requestUrl).protocol === 'https:';
}

function safeTokenCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

function parseLastEventId(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  if (!/^\d+$/.test(value)) return undefined;

  const id = Number(value);
  if (!Number.isSafeInteger(id)) return undefined;
  return id;
}

export interface BeastSseRouteDeps {
  bus: BeastEventBus;
  ticketStore: SseConnectionTicketStore;
  operatorToken: string;
  /** Optional callback to produce initial snapshot data on SSE connect. */
  getSnapshot?: () => Record<string, unknown>;
}

export function createBeastSseRoutes(deps: BeastSseRouteDeps): Hono {
  const app = new Hono();
  const { bus, ticketStore, operatorToken } = deps;

  app.post('/v1/beasts/events/ticket', (c) => {
    const headerToken = extractOperatorToken(c.req.header('Authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? undefined;
    const cookieToken = extractOperatorTokenCookie(c.req.header('cookie'));
    const provided = headerToken ?? cookieToken;

    if (!headerToken && cookieToken && !isCookieOperatorAuthAllowed({
      method: c.req.method,
      origin: c.req.header('origin'),
      requestUrl: c.req.url,
      secFetchSite: c.req.header('sec-fetch-site'),
      forwardedProto: c.req.header('x-forwarded-proto'),
      forwardedHost: c.req.header('x-forwarded-host'),
    })) {
      return c.json({ error: { code: 'FORBIDDEN', message: 'Cookie operator authentication requires a same-origin request' } }, 403);
    }

    if (!provided || !safeTokenCompare(provided, operatorToken)) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid bearer token' } }, 401);
    }

    const connectionId = randomUUID();
    const ticket = ticketStore.issue(operatorToken, connectionId);
    setCookie(c, SSE_TICKET_COOKIE, ticket, {
      httpOnly: true,
      maxAge: 30,
      path: connectionStreamPath(connectionId),
      sameSite: 'Strict',
      secure: isHttpsRequest(c.req.url, c.req.header('x-forwarded-proto')),
    });
    return c.json({ connectionId });
  });

  app.get(SSE_STREAM_PATH, (c) => (
    c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401)
  ));

  app.get(`${SSE_STREAM_PATH}/:connectionId`, (c) => {
    const ticket = getCookie(c, SSE_TICKET_COOKIE);
    if (!ticket) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }
    const ticketStatus = ticketStore.consume(ticket, operatorToken, c.req.param('connectionId'));
    if (ticketStatus === 'reused') {
      return c.body(null, 204);
    }
    if (ticketStatus === 'invalid') {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }

    const lastEventIdValue = c.req.header('Last-Event-ID') ?? c.req.query('lastEventId');
    const lastEventId = parseLastEventId(lastEventIdValue);
    if (lastEventIdValue !== undefined && lastEventId === undefined) {
      return c.json({
        error: {
          code: 'INVALID_LAST_EVENT_ID',
          message: 'Last-Event-ID must be a non-negative safe integer',
        },
      }, 400);
    }

    return streamSSE(c, async (stream) => {
      // Send initial snapshot if no Last-Event-ID (fresh connect, not reconnect)
      if (lastEventId === undefined && deps.getSnapshot) {
        await stream.writeSSE({
          id: '0',
          event: 'snapshot',
          data: JSON.stringify(deps.getSnapshot()),
        });
      }

      if (lastEventId !== undefined) {
        const missed = bus.replaySince(lastEventId);
        for (const event of missed) {
          await stream.writeSSE({
            id: String(event.id),
            event: event.type,
            data: JSON.stringify(event.data),
          });
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

      await new Promise<void>((resolve) => {
        c.req.raw.signal.addEventListener('abort', () => {
          unsub();
          resolve();
        }, { once: true });
      });
    });
  });

  return app;
}
