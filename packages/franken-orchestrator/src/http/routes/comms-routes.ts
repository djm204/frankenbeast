import { Hono, type Context } from 'hono';
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
import { requestSizeLimit } from '../middleware.js';

import type { WebhookSignaturePolicy } from '../../middleware/security-profiles.js';

const TRUSTED_REMOTE_ADDRESS_HEADER = 'x-frankenbeast-remote-address';
const DEFAULT_GENERIC_COMMS_BODY_SIZE = 16 * 1024;

export interface CommsRoutesOptions {
  config: CommsConfig;
  runtime?: CommsRuntimePort;
  webhookSignaturePolicy?: WebhookSignaturePolicy;
  getWebhookSignaturePolicy?: () => WebhookSignaturePolicy;
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
  const getWebhookSignaturePolicy = options.getWebhookSignaturePolicy
    ?? (() => options.webhookSignaturePolicy ?? 'required');
  const shouldVerifySignature = (c: Context) => {
    const policy = getWebhookSignaturePolicy();
    return policy !== 'local-dev-unsigned' || !isLoopbackWebhookRequest(c.req.raw);
  };

  if (getWebhookSignaturePolicy() === 'local-dev-unsigned') {
    console.warn('[comms] Webhook signature verification disabled for loopback-only local development');
  }

  const app = new Hono();

  app.get('/comms/health', (c) => c.json({ status: 'ok' }));
  app.use('/v1/comms', requestSizeLimit(DEFAULT_GENERIC_COMMS_BODY_SIZE));
  app.use('/v1/comms/*', requestSizeLimit(DEFAULT_GENERIC_COMMS_BODY_SIZE));

  const slack = config.channels.slack;
  if (slack?.enabled && slack.token && slack.signingSecret) {
    const adapter = new SlackAdapter({ token: slack.token });
    gateway.registerAdapter(adapter);
    app.route('/webhooks/slack', slackRouter({
      gateway,
      sessionMapper,
      signingSecret: slack.signingSecret,
      verifySignature: shouldVerifySignature,
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
      verifySignature: shouldVerifySignature,
    }));
  }

  const telegram = config.channels.telegram;
  if (telegram?.enabled && telegram.botToken && telegram.webhookSecretToken) {
    const adapter = new TelegramAdapter({ token: telegram.botToken });
    gateway.registerAdapter(adapter);
    app.route('/webhooks/telegram', telegramRouter({
      gateway,
      sessionMapper,
      botToken: telegram.botToken,
      webhookSecretToken: telegram.webhookSecretToken,
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
      verifySignature: shouldVerifySignature,
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

function isLoopbackWebhookRequest(request: Request): boolean {
  const hostname = new URL(request.url).hostname;
  const forwardedFor = request.headers.get('x-forwarded-for');
  const realIp = request.headers.get('x-real-ip');
  const trustedRemoteAddress = request.headers.get(TRUSTED_REMOTE_ADDRESS_HEADER);

  if (trustedRemoteAddress !== null) {
    return isLoopbackAddress(trustedRemoteAddress)
      && isLoopbackAddress(hostname)
      && isForwardedForLoopback(forwardedFor)
      && (realIp === null || isLoopbackAddress(realIp));
  }

  // Unit tests call Hono directly and therefore do not have an IncomingMessage
  // socket. In real Node HTTP traffic http-server-utils sets the trusted peer
  // address header above, after overwriting any client-supplied value.
  return isLoopbackAddress(hostname);
}

function isForwardedForLoopback(forwardedFor: string | null): boolean {
  if (forwardedFor === null) {
    return true;
  }
  return forwardedFor
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
    .every(isLoopbackAddress);
}

function isLoopbackAddress(address: string): boolean {
  const normalized = address.trim().toLowerCase().replace(/^\[|\]$/g, '');
  return normalized === 'localhost'
    || normalized === '127.0.0.1'
    || normalized === '::1'
    || normalized === '::ffff:127.0.0.1';
}
