import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';

export interface WhatsAppSignatureOptions {
  appSecret: string;
}

/**
 * Middleware for verifying WhatsApp/Meta request signatures.
 * Follows: https://developers.facebook.com/docs/graph-api/webhooks/getting-started#verification-requests
 */
export function whatsappSignatureMiddleware(options: WhatsAppSignatureOptions) {
  const { appSecret } = options;

  return async (c: Context, next: Next) => {
    // Meta uses X-Hub-Signature-256
    const signature = c.req.header('X-Hub-Signature-256');

    if (!signature) {
      return c.json({ error: 'Missing security header' }, 401);
    }

    try {
      const body = await c.req.text();
      const hmac = createHmac('sha256', appSecret);
      hmac.update(body);
      const expectedSignature = `sha256=${hmac.digest('hex')}`;

      const signatureBuffer = Buffer.from(signature);
      const expectedBuffer = Buffer.from(expectedSignature);

      if (signatureBuffer.length !== expectedBuffer.length) {
        return c.json({ error: 'Invalid signature length' }, 401);
      }

      if (!timingSafeEqual(signatureBuffer, expectedBuffer)) {
        return c.json({ error: 'Invalid signature' }, 401);
      }
    } catch {
      return c.json({ error: 'Signature verification failed' }, 401);
    }

    return await next();
  };
}
