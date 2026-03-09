import { Hono } from 'hono';
import { ChatGateway } from '../gateway/chat-gateway.js';
import { slackRouter } from '../channels/slack/slack-router.js';
import { discordRouter } from '../channels/discord/discord-router.js';
import { SessionMapper } from '../core/session-mapper.js';

export interface CommsAppOptions {
  gateway: ChatGateway;
  sessionMapper: SessionMapper;
  slack?: {
    signingSecret: string;
  };
  discord?: {
    publicKey: string;
  };
}

export function createCommsApp(options: CommsAppOptions): Hono {
  const { gateway, sessionMapper, slack, discord } = options;
  const app = new Hono();

  app.get('/health', (c) => c.json({ status: 'ok' }));

  if (slack) {
    app.route('/slack', slackRouter({
      gateway,
      sessionMapper,
      signingSecret: slack.signingSecret,
    }));
  }

  if (discord) {
    app.route('/discord', discordRouter({
      gateway,
      sessionMapper,
      publicKey: discord.publicKey,
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
