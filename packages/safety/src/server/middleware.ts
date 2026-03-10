import { createMiddleware } from 'hono/factory';
import { randomUUID } from 'node:crypto';

/** Adds a unique request ID header to every request. */
export const requestId = createMiddleware(async (c, next) => {
  const id = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', id);
  c.header('x-request-id', id);
  await next();
});

/** Secure the endpoints — skips if no apiKey is configured. */
export function authMiddleware(apiKey?: string) {
  return createMiddleware(async (c, next) => {
    if (!apiKey) {
      return await next();
    }

    const authHeader = c.req.header('Authorization');
    if (!authHeader || authHeader !== `Bearer ${apiKey}`) {
      return c.json(
        {
          error: {
            message: 'Unauthorized',
            type: 'authentication_error',
            request_id: c.get('requestId') ?? 'unknown',
          },
        },
        401,
      );
    }

    return await next();
  });
}

/** Global error handler — returns structured JSON error responses. */
export const errorHandler = createMiddleware(async (c, next) => {
  try {
    await next();
  } catch (error) {
    const status = 500;
    const message = error instanceof Error ? error.message : 'Internal server error';

    return c.json(
      {
        error: {
          message,
          type: 'server_error',
          request_id: c.get('requestId') ?? 'unknown',
        },
      },
      status,
    );
  }
  return undefined;
});
