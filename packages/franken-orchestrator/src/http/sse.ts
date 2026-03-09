import { streamSSE } from 'hono/streaming';
import type { Context } from 'hono';
import type { ISessionStore } from '../chat/session-store.js';
import type { TurnRunner, TurnEvent } from '../chat/turn-runner.js';

export interface SseHandlerDeps {
  sessionStore: ISessionStore;
  turnRunner: TurnRunner;
}

export function createSseHandler(deps: SseHandlerDeps) {
  const { sessionStore, turnRunner } = deps;

  return async (c: Context) => {
    const id = c.req.param('id');
    if (!id) {
      return c.json(
        { error: { code: 'BAD_REQUEST', message: 'Missing session id' } },
        400,
      );
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
