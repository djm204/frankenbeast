import { createMiddleware } from 'hono/factory';
import { HttpError } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';

export interface OperatorAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

export function extractOperatorToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) return undefined;
  const [scheme, token] = headerValue.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

export function requireOperatorAuth(options: OperatorAuthOptions) {
  return createMiddleware(async (c, next) => {
    const provided = extractOperatorToken(c.req.header('authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? undefined;

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
