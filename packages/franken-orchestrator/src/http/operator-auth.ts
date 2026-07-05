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

export function requireOperatorAuth(options: OperatorAuthOptions) {
  return createMiddleware(async (c, next) => {
    const provided = extractOperatorToken(c.req.header('authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? extractOperatorTokenCookie(c.req.header('cookie'))
      ?? undefined;

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
