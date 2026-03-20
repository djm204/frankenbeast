import { Hono } from 'hono';
import { TelegramUpdateSchema } from './telegram-schemas.js';
import type { ChatGateway } from '../../gateway/chat-gateway.js';
import type { SessionMapper } from '../../core/session-mapper.js';

export interface TelegramRouterOptions {
  gateway: ChatGateway;
  sessionMapper: SessionMapper;
  botToken: string;
}

/**
 * Router for Telegram webhook updates.
 * Security is handled by having the botToken as part of the path (standard Telegram practice).
 */
export function telegramRouter(options: TelegramRouterOptions) {
  const { gateway, sessionMapper, botToken } = options;
  const app = new Hono();

  // Telegram recommends using the bot token in the webhook URL for security
  app.post(`/${botToken}`, async (c) => {
    const body = await c.req.json();
    const update = TelegramUpdateSchema.parse(body);

    // 1. Handle incoming message
    if (update.message?.text) {
      const msg = update.message;
      
      // Ignore bot's own messages
      if (msg.from.is_bot) return c.json({ ok: true });

      // Clean up text if it contains commands
      const text = update.message.text;
      if (msg.entities) {
        for (const entity of msg.entities) {
          if (entity.type === 'bot_command') {
            // Optional: Handle commands specifically
          }
        }
      }

      await gateway.handleInbound({
        channelType: 'telegram',
        externalUserId: msg.from.id.toString(),
        externalChannelId: msg.chat.id.toString(),
        externalMessageId: msg.message_id.toString(),
        text,
        receivedAt: new Date(msg.date * 1000).toISOString(),
        rawEvent: body,
      });
    }

    // 2. Handle inline keyboard callback
    if (update.callback_query?.data) {
      const query = update.callback_query;
      const chatId = query.message?.chat.id.toString();
      const userId = query.from.id.toString();

      if (chatId) {
        const sessionId = sessionMapper.mapToSessionId({
          channelType: 'telegram',
          externalUserId: userId,
          externalChannelId: chatId,
        });

        await gateway.handleAction('telegram', sessionId, update.callback_query.data);
      }

      // Acknowledge callback query
      await fetch(`https://api.telegram.org/bot${botToken}/answerCallbackQuery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ callback_query_id: query.id }),
      });
    }

    return c.json({ ok: true });
  });

  return app;
}
