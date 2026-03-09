import { Hono } from 'hono';
import { ChatGateway } from '../gateway/chat-gateway.js';
import { slackRouter } from '../channels/slack/slack-router.js';
import { discordRouter } from '../channels/discord/discord-router.js';
import { telegramRouter } from '../channels/telegram/telegram-router.js';
import { whatsappRouter } from '../channels/whatsapp/whatsapp-router.js';
import { SessionMapper } from '../core/session-mapper.js';
import { SlackAdapter } from '../channels/slack/slack-adapter.js';
import { DiscordAdapter } from '../channels/discord/discord-adapter.js';
import { TelegramAdapter } from '../channels/telegram/telegram-adapter.js';
import { WhatsAppAdapter } from '../channels/whatsapp/whatsapp-adapter.js';
import type { CommsConfig } from '../config/comms-config.js';

export function createCommsApp(config: CommsConfig): Hono {
  const sessionMapper = new SessionMapper();
  const gateway = new ChatGateway({
    orchestratorWsUrl: config.orchestrator.wsUrl,
    orchestratorToken: config.orchestrator.token,
  });

  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  // Initialize and register adapters
  if (config.channels.slack?.enabled && config.channels.slack.token && config.channels.slack.signingSecret) {
    const slack = config.channels.slack;
    const adapter = new SlackAdapter({ token: slack.token });
    gateway.registerAdapter(adapter);
    app.route('/slack', slackRouter({
      gateway,
      sessionMapper,
      signingSecret: slack.signingSecret,
    }));
  }

  if (config.channels.discord?.enabled && config.channels.discord.token && config.channels.discord.publicKey) {
    const discord = config.channels.discord;
    const adapter = new DiscordAdapter({ token: discord.token });
    gateway.registerAdapter(adapter);
    app.route('/discord', discordRouter({
      gateway,
      sessionMapper,
      publicKey: discord.publicKey,
    }));
  }

  if (config.channels.telegram?.enabled && config.channels.telegram.botToken) {
    const telegram = config.channels.telegram;
    const adapter = new TelegramAdapter({ token: telegram.botToken });
    gateway.registerAdapter(adapter);
    app.route('/telegram', telegramRouter({
      gateway,
      sessionMapper,
      botToken: telegram.botToken,
    }));
  }

  if (config.channels.whatsapp?.enabled && config.channels.whatsapp.accessToken && config.channels.whatsapp.phoneNumberId && config.channels.whatsapp.appSecret && config.channels.whatsapp.verifyToken) {
    const whatsapp = config.channels.whatsapp;
    const adapter = new WhatsAppAdapter({
      accessToken: whatsapp.accessToken,
      phoneNumberId: whatsapp.phoneNumberId,
    });
    gateway.registerAdapter(adapter);
    app.route('/whatsapp', whatsappRouter({
      gateway,
      sessionMapper,
      appSecret: whatsapp.appSecret,
      verifyToken: whatsapp.verifyToken,
    }));
  }

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
