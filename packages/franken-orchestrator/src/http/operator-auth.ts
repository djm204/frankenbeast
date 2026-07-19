import { createMiddleware } from 'hono/factory';
import { HttpError } from './middleware.js';
import { TransportSecurityService } from './security/transport-security.js';

export interface OperatorAuthOptions {
  operatorToken: string;
  security: TransportSecurityService;
}

export const OPERATOR_TOKEN_COOKIE = 'frankenbeast_operator_token';
export const OPERATOR_TOKEN_HEADER = 'x-frankenbeast-operator-token';

/**
 * Remove gateway-only operator credentials before a request crosses into a
 * downstream service. Returns the legacy header token so callers can replace
 * it with canonical bearer authorization when needed.
 */
export function stripOperatorCredentialHeaders(headers: Headers): string | undefined {
  const headerToken = headers.get(OPERATOR_TOKEN_HEADER)?.trim() || undefined;
  headers.delete(OPERATOR_TOKEN_HEADER);

  const cookieHeader = headers.get('cookie');
  if (cookieHeader) {
    const retainedCookies = cookieHeader
      .split(';')
      .map((cookie) => cookie.trim())
      .filter((cookie) => cookie.length > 0 && cookie.split('=', 1)[0] !== OPERATOR_TOKEN_COOKIE);
    if (retainedCookies.length > 0) {
      headers.set('cookie', retainedCookies.join('; '));
    } else {
      headers.delete('cookie');
    }
  }

  return headerToken;
}

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

function originFromRequestUrl(requestUrl: string, forwardedProto?: string | undefined, forwardedHost?: string | undefined): string {
  const url = new URL(requestUrl);
  const proto = forwardedProto?.split(',')[0]?.trim().toLowerCase();
  const host = forwardedHost?.split(',')[0]?.trim();
  if (proto === 'http' || proto === 'https') {
    url.protocol = `${proto}:`;
  }
  if (host) {
    url.host = host;
  }
  return url.origin;
}

export function isCookieOperatorAuthAllowed(options: {
  method: string;
  origin?: string | undefined;
  requestUrl: string;
  secFetchSite?: string | undefined;
  forwardedProto?: string | undefined;
  forwardedHost?: string | undefined;
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
    return new URL(options.origin).origin === originFromRequestUrl(
      options.requestUrl,
      options.forwardedProto,
      options.forwardedHost,
    );
  } catch {
    return false;
  }
}

export function requireOperatorAuth(options: OperatorAuthOptions) {
  return createMiddleware(async (c, next) => {
    const headerToken = extractOperatorToken(c.req.header('authorization'))
      ?? c.req.header(OPERATOR_TOKEN_HEADER)
      ?? undefined;
    const cookieToken = extractOperatorTokenCookie(c.req.header('cookie'));
    const provided = headerToken ?? cookieToken;

    if (!headerToken && cookieToken && !isCookieOperatorAuthAllowed({
      method: c.req.method,
      origin: c.req.header('origin'),
      requestUrl: c.req.url,
      secFetchSite: c.req.header('sec-fetch-site'),
      forwardedProto: c.req.header('x-forwarded-proto'),
      forwardedHost: c.req.header('x-forwarded-host'),
    })) {
      throw new HttpError(403, 'FORBIDDEN', 'Cookie operator authentication requires a same-origin request');
    }

    if (!options.security.verifyOperatorToken(provided, options.operatorToken)) {
      throw new HttpError(401, 'UNAUTHORIZED', 'Operator authentication is required');
    }

    await next();
  });
}
