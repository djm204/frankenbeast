import { randomUUID } from 'node:crypto';
import type { Context, ErrorHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { ZodSchema } from 'zod';

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
  }
}

export const requestId = createMiddleware(async (c, next) => {
  const id = c.req.header('x-request-id') ?? randomUUID();
  c.set('requestId', id);
  c.header('x-request-id', id);
  await next();
});

export function validateBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    throw new HttpError(
      422,
      'VALIDATION_ERROR',
      'Request validation failed',
      result.error.issues,
    );
  }
  return result.data;
}

export async function parseJsonBody(c: Context): Promise<unknown> {
  try {
    return await c.req.json();
  } catch (error) {
    if (error instanceof Error && error.name === 'BodyLimitError') {
      throw new HttpError(413, 'PAYLOAD_TOO_LARGE', 'Request body exceeds configured limit');
    }
    throw new HttpError(400, 'MALFORMED_JSON', 'Malformed JSON body');
  }
}

export function requestSizeLimit(maxSize: number) {
  return bodyLimit({
    maxSize,
    onError: (c) =>
      c.json(
        {
          error: {
            code: 'PAYLOAD_TOO_LARGE',
            message: `Request body exceeds ${maxSize} bytes`,
            details: { maxSize },
          },
        } satisfies ApiError,
        413,
      ),
  });
}

export const errorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
    if (err.statusCode >= 500) {
      console.error(`[HTTP ${err.statusCode}] ${err.code}: ${err.message}`, err.details ?? '');
    } else {
      console.warn(`[HTTP ${err.statusCode}] ${err.code}: ${err.message}`, err.details ?? '');
    }
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...(err.details !== undefined ? { details: err.details } : {}),
        },
      } satisfies ApiError,
      err.statusCode as 400,
    );
  }

  // Log unexpected errors to terminal — essential for debugging
  console.error('[HTTP 500] Unhandled error:', err instanceof Error ? err.stack ?? err.message : err);

  // Never expose raw stack traces to client
  return c.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    } satisfies ApiError,
    500,
  );
};
