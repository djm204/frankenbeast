import { Hono } from 'hono';
import { ChatGateway } from '../../comms/gateway/chat-gateway.js';
import { SessionMapper } from '../../comms/core/session-mapper.js';
import { slackRouter } from '../../comms/channels/slack/slack-router.js';
import { discordRouter } from '../../comms/channels/discord/discord-router.js';
import { telegramRouter } from '../../comms/channels/telegram/telegram-router.js';
import { whatsappRouter } from '../../comms/channels/whatsapp/whatsapp-router.js';
import { SlackAdapter } from '../../comms/channels/slack/slack-adapter.js';
import { DiscordAdapter } from '../../comms/channels/discord/discord-adapter.js';
import { TelegramAdapter } from '../../comms/channels/telegram/telegram-adapter.js';
import { WhatsAppAdapter } from '../../comms/channels/whatsapp/whatsapp-adapter.js';
import type { CommsConfig } from '../../comms/config/comms-config.js';
import type { CommsRuntimePort } from '../../comms/core/comms-runtime-port.js';

export interface CommsRoutesOptions {
  config: CommsConfig;
  runtime?: CommsRuntimePort;
}

export function commsRoutes(options: CommsRoutesOptions): Hono {
  const { config, runtime } = options;
  const sessionMapper = new SessionMapper();

  if (!runtime) {
    throw new Error(
      'commsRoutes requires a CommsRuntimePort — the WebSocket bridge has been removed. ' +
      'Pass a ChatRuntimeCommsAdapter instance as the runtime option.',
    );
  }

  const gateway = new ChatGateway(runtime);

  const app = new Hono();

  app.get('/comms/health', (c) => c.json({ status: 'ok' }));

  const slack = config.channels.slack;
  if (slack?.enabled && slack.token && slack.signingSecret) {
    const adapter = new SlackAdapter({ token: slack.token });
    gateway.registerAdapter(adapter);
    app.route('/webhooks/slack', slackRouter({
      gateway,
      sessionMapper,
      signingSecret: slack.signingSecret,
    }));
  }

  const discord = config.channels.discord;
  if (discord?.enabled && discord.token && discord.publicKey) {
    const adapter = new DiscordAdapter({ token: discord.token });
    gateway.registerAdapter(adapter);
    app.route('/webhooks/discord', discordRouter({
      gateway,
      sessionMapper,
      publicKey: discord.publicKey,
    }));
  }

  const telegram = config.channels.telegram;
  if (telegram?.enabled && telegram.botToken) {
    const adapter = new TelegramAdapter({ token: telegram.botToken });
    gateway.registerAdapter(adapter);
    app.route('/webhooks/telegram', telegramRouter({
      gateway,
      sessionMapper,
      botToken: telegram.botToken,
    }));
  }

  const whatsapp = config.channels.whatsapp;
  if (whatsapp?.enabled && whatsapp.accessToken && whatsapp.phoneNumberId && whatsapp.appSecret && whatsapp.verifyToken) {
    const adapter = new WhatsAppAdapter({
      accessToken: whatsapp.accessToken,
      phoneNumberId: whatsapp.phoneNumberId,
    });
    gateway.registerAdapter(adapter);
    app.route('/webhooks/whatsapp', whatsappRouter({
      gateway,
      sessionMapper,
      appSecret: whatsapp.appSecret,
      verifyToken: whatsapp.verifyToken,
    }));
  }

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
