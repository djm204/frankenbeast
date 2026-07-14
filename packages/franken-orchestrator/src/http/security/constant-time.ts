import { createHash, timingSafeEqual } from 'node:crypto';

function tokenDigest(token: string): Buffer {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Compare untrusted token strings without short-circuiting on length or prefix.
 *
 * The raw token lengths still determine whether the match is accepted, but the
 * equality check always compares fixed-length SHA-256 digests with
 * timingSafeEqual so mismatches do not leak how much of the token matched.
 */
export function constantTimeTokenEqual(providedToken: string, expectedToken: string): boolean {
  const providedDigest = tokenDigest(providedToken);
  const expectedDigest = tokenDigest(expectedToken);
  const digestsMatch = timingSafeEqual(providedDigest, expectedDigest);
  return digestsMatch && providedToken.length === expectedToken.length;
}
