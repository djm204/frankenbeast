import { createHmac, timingSafeEqual } from 'node:crypto';
import type { Context, Next } from 'hono';

export interface SlackSignatureOptions {
  signingSecret: string;
}

/**
 * Middleware for verifying Slack request signatures.
 * Follows: https://api.slack.com/authentication/verifying-requests-from-slack
 */
export function slackSignatureMiddleware(options: SlackSignatureOptions) {
  const { signingSecret } = options;

  return async (c: Context, next: Next) => {
    const timestamp = c.req.header('X-Slack-Request-Timestamp');
    const signature = c.req.header('X-Slack-Signature');

    if (!timestamp || !signature) {
      return c.json({ error: 'Missing security headers' }, 401);
    }

    // 1. Replay attack prevention (5 minutes window)
    const fiveMinutesAgo = Math.floor(Date.now() / 1000) - 300;
    if (parseInt(timestamp, 10) < fiveMinutesAgo) {
      return c.json({ error: 'Signature expired' }, 401);
    }

    // 2. Body verification
    // Hono will read the body into memory once for the middleware
    // but the next handlers might need it too.
    const body = await c.req.text();
    const basestring = `v0:${timestamp}:${body}`;

    const hmac = createHmac('sha256', signingSecret);
    hmac.update(basestring);
    const expectedSignature = `v0=${hmac.digest('hex')}`;

    const signatureBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSignature);

    if (signatureBuffer.length !== expectedBuffer.length) {
      return c.json({ error: 'Invalid signature length' }, 401);
    }

    // Timing-safe comparison to prevent timing attacks
    const isValid = timingSafeEqual(signatureBuffer, expectedBuffer);

    if (!isValid) {
      return c.json({ error: 'Invalid signature' }, 401);
    }

    // Since we've read the body as text, we might need to reset it 
    // or provide a way for subsequent handlers to access it.
    // However, Hono's `c.req.text()` can be called multiple times if it's already buffered.
    
    return await next();
  };
}
