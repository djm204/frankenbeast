import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { Context, Next } from 'hono';
import { wallClockNow } from '@franken/types';

export interface DiscordSignatureOptions {
  publicKey: string;
  /**
   * Maximum age (in seconds) an interaction timestamp may have, in either
   * direction, before it is rejected as stale or excessively future-skewed.
   * Defaults to 300 seconds (5 minutes).
   */
  toleranceSeconds?: number;
}

/** Default freshness window for Discord interaction timestamps (5 minutes). */
const DEFAULT_TOLERANCE_SECONDS = 300;

/**
 * Middleware for verifying Discord interaction signatures.
 * Discord uses Ed25519 signatures.
 * Follows: https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
export function discordSignatureMiddleware(options: DiscordSignatureOptions) {
  const { publicKey, toleranceSeconds = DEFAULT_TOLERANCE_SECONDS } = options;

  // Prepare the public key object once (Discord public keys are 32-byte hex strings)
  let keyObject: KeyObject | undefined;
  try {
    // Node.js createPublicKey expects a specific format for Ed25519
    // This is the RFC8410 SPKI format for Ed25519 public keys
    const rawKey = Buffer.from(publicKey, 'hex');
    const header = Buffer.from('302a300506032b6570032100', 'hex');
    const spki = Buffer.concat([header, rawKey]);
    keyObject = createPublicKey({ key: spki, format: 'der', type: 'spki' });
  } catch {

    // If the key is invalid at startup, we let it be but it will fail all requests
  }

  return async (c: Context, next: Next) => {
    const timestamp = c.req.header('X-Signature-Timestamp');
    const signature = c.req.header('X-Signature-Ed25519');

    if (!timestamp || !signature || !keyObject) {
      return c.json({ error: 'Missing security headers or invalid server config' }, 401);
    }

    // Reject stale or future-skewed timestamps to prevent replay of captured
    // interactions. Discord sends X-Signature-Timestamp as seconds since epoch.
    const timestampSeconds = Number(timestamp);
    if (!Number.isFinite(timestampSeconds)) {
      return c.json({ error: 'Invalid signature timestamp' }, 401);
    }
    const nowSeconds = wallClockNow() / 1000;
    if (Math.abs(nowSeconds - timestampSeconds) > toleranceSeconds) {
      return c.json({ error: 'Stale signature timestamp' }, 401);
    }

    try {
      const body = await c.req.text();
      const message = Buffer.from(timestamp + body);
      const signatureBuffer = Buffer.from(signature, 'hex');

      const isValid = verify(null, message, keyObject, signatureBuffer);

      if (!isValid) {
        return c.json({ error: 'Invalid signature' }, 401);
      }
    } catch {
      return c.json({ error: 'Signature verification failed' }, 401);
    }

    return await next();
  };
}
