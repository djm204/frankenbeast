import { createMiddleware } from 'hono/factory';
import { HttpError } from '../../http/middleware.js';
import { TransportSecurityService } from '../../http/security/transport-security.js';

export interface BeastAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

function extractBearerToken(headerValue: string | undefined): string | undefined {
  if (!headerValue) {
    return undefined;
  }
  const [scheme, token] = headerValue.split(' ');
  if (scheme?.toLowerCase() !== 'bearer' || !token) {
    return undefined;
  }
  return token;
}

export function requireBeastOperatorAuth(options: BeastAuthOptions) {
  return createMiddleware(async (c, next) => {
    const provided = extractBearerToken(c.req.header('authorization'))
      ?? c.req.header('x-frankenbeast-operator-token')
      ?? undefined;

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
