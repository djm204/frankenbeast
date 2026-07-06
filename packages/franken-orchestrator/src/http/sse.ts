import { timingSafeEqual } from 'node:crypto';
import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import type { ISessionStore } from '../chat/session-store.js';
import type { TurnRunner, TurnEvent } from '../chat/turn-runner.js';
import type { SseConnectionTicketStore } from '../beasts/events/sse-connection-ticket.js';
import { extractOperatorToken, extractOperatorTokenCookie, isCookieOperatorAuthAllowed } from './operator-auth.js';

export interface SseHandlerDeps {
  sessionStore: ISessionStore;
  turnRunner: TurnRunner;
  operatorToken?: string | undefined;
  ticketStore?: SseConnectionTicketStore | undefined;
}

export function createSseHandler(deps: SseHandlerDeps) {
  const { sessionStore, turnRunner, operatorToken, ticketStore } = deps;

  return async (c: Context) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing session id' } },
        400,
      );
    }

    if (operatorToken && !hasValidStreamCredential(c, operatorToken, id, ticketStore)) {
      return c.json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired ticket' } }, 401);
    }

    const session = sessionStore.get(id);
    if (!session) {
      return c.json(
        { error: { code: 'NOT_FOUND', message: `Session '${id}' not found` } },
        404,
      );
    }

    return streamSSE(c, async (stream) => {
      await stream.writeSSE({
        event: 'connected',
        data: JSON.stringify({ sessionId: id }),
        retry: 3000,
      });

      await new Promise<void>((resolve) => {
        let writeChain = Promise.resolve();

        const onEvent = (event: TurnEvent) => {
          if (event.sessionId !== id) {
            return;
          }

          writeChain = writeChain.then(async () => {
            await stream.writeSSE({
              event: event.type,
              data: JSON.stringify(event),
            });
            if (event.type === 'complete') {
              cleanup();
              resolve();
            }
          });
        };

        const cleanup = () => {
          turnRunner.off('event', onEvent);
        };

        turnRunner.on('event', onEvent);

        c.req.raw.signal.addEventListener('abort', () => {
          cleanup();
          resolve();
        });
      });
    });
  };
}

function hasValidStreamCredential(
  c: Context,
  operatorToken: string,
  sessionId: string,
  ticketStore: SseConnectionTicketStore | undefined,
): boolean {
  const ticket = c.req.query('ticket');
  if (ticket) {
    return Boolean(ticketStore && ticketStore.validate(ticket, operatorToken, sessionId));
  }

  const headerToken = extractOperatorToken(c.req.header('authorization'))
    ?? c.req.header('x-frankenbeast-operator-token')
    ?? undefined;
  const cookieToken = extractOperatorTokenCookie(c.req.header('cookie'));
  if (!headerToken && cookieToken && !isCookieOperatorAuthAllowed({
    method: c.req.method,
    origin: c.req.header('origin'),
    requestUrl: c.req.url,
    secFetchSite: c.req.header('sec-fetch-site'),
  })) {
    return false;
  }

  const provided = headerToken ?? cookieToken;
  if (provided && safeTokenCompare(provided, operatorToken)) {
    return true;
  }

  return false;
}

function safeTokenCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}
