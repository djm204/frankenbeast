import { createMiddleware } from 'hono/factory';
import { HttpError } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';

export interface OperatorAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

export const OPERATOR_TOKEN_COOKIE = 'frankenbeast_operator_token';

export function extractOperatorToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) return undefined;
  const [scheme, token] = headerValue.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function extractOperatorTokenCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;
  for (const cookie of cookieHeader.split(';')) {
    const [rawName, ...rawValue] = cookie.trim().split('=');
    if (rawName === OPERATOR_TOKEN_COOKIE && rawValue.length > 0) {
      const value = rawValue.join('=').trim();
      try {
        return value ? decodeURIComponent(value) : undefined;
      } catch {
        return value || undefined;
      }
    }
  }
  return undefined;
}

function isUnsafeMethod(method: string): boolean {
  return !['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method.toUpperCase());
}

export function isCookieOperatorAuthAllowed(options: {
  method: string;
  origin?: string | undefined;
  requestUrl: string;
  secFetchSite?: string | undefined;
}): boolean {
  if (!isUnsafeMethod(options.method)) {
    return true;
  }

  if (options.secFetchSite && options.secFetchSite !== 'same-origin') {
    return false;
  }

  if (!options.origin) {
    return false;
  }

  try {
    return new URL(options.origin).origin === new URL(options.requestUrl).origin;
  } catch {
    return false;
  }
}

export function requireOperatorAuth(options: OperatorAuthOptions) {
  return createMiddleware(async (c, next) => {
    const headerToken = extractOperatorToken(c.req.header('authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? undefined;
    const cookieToken = extractOperatorTokenCookie(c.req.header('cookie'));
    const provided = headerToken ?? cookieToken;

    if (!headerToken && cookieToken && !isCookieOperatorAuthAllowed({
      method: c.req.method,
      origin: c.req.header('origin'),
      requestUrl: c.req.url,
      secFetchSite: c.req.header('sec-fetch-site'),
    })) {
      throw new HttpError(403, 'FORBIDDEN', 'Cookie operator authentication requires a same-origin request');
    }

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
