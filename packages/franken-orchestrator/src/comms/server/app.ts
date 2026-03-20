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
  const slack = config.channels.slack;
  if (slack?.enabled && slack.token && slack.signingSecret) {
    const token = slack.token;
    const signingSecret = slack.signingSecret;
    const adapter = new SlackAdapter({ token });
    gateway.registerAdapter(adapter);
    app.route('/slack', slackRouter({
      gateway,
      sessionMapper,
      signingSecret,
    }));
  }

  const discord = config.channels.discord;
  if (discord?.enabled && discord.token && discord.publicKey) {
    const token = discord.token;
    const publicKey = discord.publicKey;
    const adapter = new DiscordAdapter({ token });
    gateway.registerAdapter(adapter);
    app.route('/discord', discordRouter({
      gateway,
      sessionMapper,
      publicKey,
    }));
  }

  const telegram = config.channels.telegram;
  if (telegram?.enabled && telegram.botToken) {
    const botToken = telegram.botToken;
    const adapter = new TelegramAdapter({ token: botToken });
    gateway.registerAdapter(adapter);
    app.route('/telegram', telegramRouter({
      gateway,
      sessionMapper,
      botToken,
    }));
  }

  const whatsapp = config.channels.whatsapp;
  if (whatsapp?.enabled && whatsapp.accessToken && whatsapp.phoneNumberId && whatsapp.appSecret && whatsapp.verifyToken) {
    const accessToken = whatsapp.accessToken;
    const phoneNumberId = whatsapp.phoneNumberId;
    const appSecret = whatsapp.appSecret;
    const verifyToken = whatsapp.verifyToken;
    const adapter = new WhatsAppAdapter({
      accessToken,
      phoneNumberId,
    });
    gateway.registerAdapter(adapter);
    app.route('/whatsapp', whatsappRouter({
      gateway,
      sessionMapper,
      appSecret,
      verifyToken,
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
