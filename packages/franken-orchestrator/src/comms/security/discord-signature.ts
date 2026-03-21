import { createPublicKey, verify, type KeyObject } from 'node:crypto';
import type { Context, Next } from 'hono';

export interface DiscordSignatureOptions {
  publicKey: string;
}

/**
 * Middleware for verifying Discord interaction signatures.
 * Discord uses Ed25519 signatures.
 * Follows: https://discord.com/developers/docs/interactions/receiving-and-responding#security-and-authorization
 */
export function discordSignatureMiddleware(options: DiscordSignatureOptions) {
  const { publicKey } = options;

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
