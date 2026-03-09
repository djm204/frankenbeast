import { Hono } from 'hono';
import { whatsappSignatureMiddleware } from '../../security/whatsapp-signature.js';
import { WhatsAppWebhookSchema } from './whatsapp-schemas.js';
import type { ChatGateway } from '../../gateway/chat-gateway.js';
import type { SessionMapper } from '../../core/session-mapper.js';

export interface WhatsAppRouterOptions {
  gateway: ChatGateway;
  sessionMapper: SessionMapper;
  appSecret: string;
  verifyToken: string;
}

export function whatsappRouter(options: WhatsAppRouterOptions) {
  const { gateway, sessionMapper, appSecret, verifyToken } = options;
  const app = new Hono();

  // Verification challenge: Meta sends a GET request to verify the webhook
  app.get('/webhook', (c) => {
    const mode = c.req.query('hub.mode');
    const token = c.req.query('hub.verify_token');
    const challenge = c.req.query('hub.challenge');

    if (mode === 'subscribe' && token === verifyToken) {
      return c.text(challenge || '');
    }
    return c.json({ error: 'Forbidden' }, 403);
  });

  // Incoming messages: Meta sends a POST request with signatures
  app.post('/webhook', whatsappSignatureMiddleware({ appSecret }), async (c) => {
    const body = await c.req.json();
    const parsed = WhatsAppWebhookSchema.parse(body);

    for (const entry of parsed.entry) {
      for (const change of entry.changes) {
        const value = change.value;
        if (!value.messages) continue;

        for (const message of value.messages) {
          const from = message.from;
          const sessionId = sessionMapper.mapToSessionId({
            channelType: 'whatsapp',
            externalUserId: from,
            externalChannelId: from, // In WhatsApp, phone is the channel
          });

          // Handle text message
          if (message.type === 'text' && message.text) {
            await gateway.handleInbound({
              channelType: 'whatsapp',
              externalUserId: from,
              externalChannelId: from,
              externalMessageId: message.id,
              text: message.text.body,
              receivedAt: new Date(parseInt(message.timestamp, 10) * 1000).toISOString(),
              rawEvent: body,
            });
          }

          // Handle interactive button reply
          if (message.type === 'interactive' && message.interactive?.button_reply) {
            const actionId = message.interactive.button_reply.id;
            await gateway.handleAction('whatsapp', sessionId, actionId);
          }
        }
      }
    }

    return c.json({ ok: true });
  });

  return app;
}
