import { Hono } from 'hono';
import { TelegramUpdateSchema } from './telegram-schemas.js';
import { decodeTelegramCallbackData } from './telegram-adapter.js';
import { redactTelegramBotTokenUrls } from '../../../security/telegram-redaction.js';
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

  // Telegram recommends using the bot token in the webhook URL for security.
  // Compare the token as route data instead of interpolating it into the route
  // template because Telegram tokens contain ':' and Hono treats ':' as a
  // parameter marker in literal route strings.
  app.post('/:token', async (c) => {
    if (c.req.param('token') !== botToken) {
      return c.json({ error: 'Not found' }, 404);
    }
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
        const callback = decodeTelegramCallbackData(update.callback_query.data);
        const sessionId = callback.sessionId ?? sessionMapper.mapToSessionId({
          channelType: 'telegram',
          externalUserId: userId,
          externalChannelId: chatId,
        });

        await gateway.handleAction('telegram', sessionId, callback.actionId, {
          externalChannelId: chatId,
          chatId,
        });
      }

      // Acknowledge callback query
      const targetUrl = `https://api.telegram.org/bot${botToken}/answerCallbackQuery`;
      try {
        const response = await fetch(targetUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ callback_query_id: query.id }),
        });
        if (!response.ok) {
          const error = redactTelegramBotTokenUrls(await response.text());
          const redactedUrl = redactTelegramBotTokenUrls(targetUrl);
          console.warn(`Telegram API error: ${response.status} ${redactedUrl} ${error}`);
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const redactedUrl = redactTelegramBotTokenUrls(targetUrl);
        console.warn(`Telegram API error: ${redactedUrl} ${redactTelegramBotTokenUrls(message)}`);
      }
    }

    return c.json({ ok: true });
  });

  return app;
}
