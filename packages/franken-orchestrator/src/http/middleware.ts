import type { ErrorHandler } from 'hono';
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

export const globalErrorHandler: ErrorHandler = (err, c) => {
  if (err instanceof HttpError) {
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

  // Never expose raw stack traces
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
