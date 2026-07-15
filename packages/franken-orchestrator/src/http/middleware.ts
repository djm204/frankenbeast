import type { Context, ErrorHandler } from 'hono';
import { bodyLimit } from 'hono/body-limit';
import { createMiddleware } from 'hono/factory';
import type { ZodSchema } from 'zod';
import { deterministicUuid } from '@franken/types';

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
  const id = c.req.header('x-request-id') ?? deterministicUuid('packages/franken-orchestrator/src/http/middleware.ts');
  c.set('requestId', id);
  c.header('x-request-id', id);
  await next();
});

const UNSAFE_BROWSER_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);
const LOCAL_CONTROL_PATH_PREFIXES = [
  '/api/analytics',
  '/api/dashboard',
  '/api/security',
  '/api/skills',
  '/v1/beasts',
  '/v1/chat',
  '/v1/comms',
  '/v1/network',
] as const;

function firstHeaderValue(value: string | undefined): string | undefined {
  return value?.split(',')[0]?.trim() || undefined;
}

function requestOrigin(c: Context): string {
  const url = new URL(c.req.url);
  const forwardedProto = firstHeaderValue(c.req.header('x-forwarded-proto'))?.toLowerCase();
  const forwardedHost = firstHeaderValue(c.req.header('x-forwarded-host'));
  if (forwardedProto === 'http' || forwardedProto === 'https') {
    url.protocol = `${forwardedProto}:`;
  }
  if (forwardedHost) {
    url.host = forwardedHost;
  }
  return url.origin;
}

function forwardedOrigin(c: Context): string | undefined {
  const forwardedProto = firstHeaderValue(c.req.header('x-forwarded-proto'))?.toLowerCase();
  const forwardedHost = firstHeaderValue(c.req.header('x-forwarded-host'));
  if ((forwardedProto === 'http' || forwardedProto === 'https') && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`;
  }
  return undefined;
}

function isLocalControlPath(pathname: string): boolean {
  return LOCAL_CONTROL_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

function isTrustedOriginHost(origin: string): boolean {
  try {
    const hostname = new URL(origin).hostname;
    return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1' || hostname === '[::1]';
  } catch {
    return false;
  }
}

function isSameOriginMutation(c: Context, allowedOrigins: ReadonlySet<string>): boolean {
  const origin = c.req.header('origin');
  const secFetchSite = c.req.header('sec-fetch-site')?.trim().toLowerCase();
  if (!origin) {
    if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
      return false;
    }
    return true;
  }

  let normalizedOrigin: string;
  try {
    normalizedOrigin = new URL(origin).origin;
  } catch {
    return false;
  }

  if (allowedOrigins.has(normalizedOrigin)) {
    return true;
  }

  if (secFetchSite && secFetchSite !== 'same-origin' && secFetchSite !== 'none') {
    return false;
  }

  const normalizedRequestOrigin = requestOrigin(c);
  const normalizedForwardedOrigin = forwardedOrigin(c);
  return (normalizedOrigin === normalizedRequestOrigin && isTrustedOriginHost(normalizedOrigin))
    || normalizedOrigin === normalizedForwardedOrigin;
}

function setLocalBrowserSecurityHeaders(c: Context): void {
  c.header('Content-Security-Policy', "frame-ancestors 'none'");
  c.header('X-Frame-Options', 'DENY');
  c.header('X-Content-Type-Options', 'nosniff');
  c.header('Referrer-Policy', 'same-origin');
}

export function localBrowserControlProtection(options: { allowedOrigins?: Iterable<string> } = {}) {
  const allowedOrigins = new Set(
    [...(options.allowedOrigins ?? [])]
      .filter((origin) => origin !== '*')
      .map((origin) => new URL(origin).origin),
  );

  return createMiddleware(async (c, next) => {
    setLocalBrowserSecurityHeaders(c);

    const pathname = new URL(c.req.url).pathname;
    if (UNSAFE_BROWSER_METHODS.has(c.req.method.toUpperCase())
      && isLocalControlPath(pathname)
      && !isSameOriginMutation(c, allowedOrigins)) {
      throw new HttpError(403, 'FORBIDDEN', 'Local web control mutations require a same-origin browser request');
    }

    await next();
    setLocalBrowserSecurityHeaders(c);
  });
}

export const DEFAULT_MAX_BODY_SIZE = 16 * 1024;
export const BEAST_CONTROL_MAX_BODY_SIZE = 1024 * 1024;
export const SKILL_CONTEXT_MAX_BODY_SIZE = 1024 * 1024;

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
