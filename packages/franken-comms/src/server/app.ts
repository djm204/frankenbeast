import { Hono } from 'hono';
import { ChatGateway } from '../gateway/chat-gateway.js';

export interface CommsAppOptions {
  gateway: ChatGateway;
}

export function createCommsApp(options: CommsAppOptions): Hono {
  const { gateway } = options;
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Gateway routes for external platforms to hit
  // These will be expanded in later phases with platform-specific routes
  
  // Generic test/bridge route for development/verification
  app.post('/v1/comms/inbound', async (c) => {
    const body = await c.req.json();
    await gateway.handleInbound(body);
    return c.json({ accepted: true });
  });

  app.post('/v1/comms/action', async (c) => {
    const { channelType, sessionId, actionId } = await c.req.json();
    await gateway.handleAction(channelType, sessionId, actionId);
    return c.json({ accepted: true });
  });

  return app;
}
