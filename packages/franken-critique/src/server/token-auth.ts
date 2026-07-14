import { createHash, timingSafeEqual } from 'node:crypto';

function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

function constantTimeTokenEqual(providedToken: string, expectedToken: string): boolean {
  const providedDigest = tokenDigest(providedToken);
  const expectedDigest = tokenDigest(expectedToken);
  const digestsMatch = timingSafeEqual(providedDigest, expectedDigest);
  return digestsMatch && providedToken.length === expectedToken.length;
}

/** Compare an Authorization header to the configured bearer token without a raw string equality check. */
export function timingSafeBearerTokenMatches(authHeader: string | undefined, bearerToken: string): boolean {
  if (!authHeader) return false;
  return constantTimeTokenEqual(authHeader, `Bearer ${bearerToken}`);
}
