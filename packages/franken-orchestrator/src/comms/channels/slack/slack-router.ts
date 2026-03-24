import { Hono } from 'hono';
import { slackSignatureMiddleware } from '../../security/slack-signature.js';
import { SlackEventBaseSchema, SlackInteractionSchema } from './slack-schemas.js';
import type { ChatGateway } from '../../gateway/chat-gateway.js';
import type { SessionMapper } from '../../core/session-mapper.js';

export interface SlackRouterOptions {
  gateway: ChatGateway;
  sessionMapper: SessionMapper;
  signingSecret: string;
  verifySignature?: boolean;
}

export function slackRouter(options: SlackRouterOptions) {
  const { gateway, sessionMapper, signingSecret } = options;
  const app = new Hono();

  if (options.verifySignature !== false) {
    app.use('*', slackSignatureMiddleware({ signingSecret }));
  }

  // Events API: https://api.slack.com/events-api
  app.post('/events', async (c) => {
    const body = await c.req.json();
    const parsed = SlackEventBaseSchema.parse(body);

    // Handle Slack challenge (url_verification)
    if (parsed.type === 'url_verification') {
      return c.json({ challenge: parsed.challenge });
    }

    if (parsed.type === 'event_callback' && parsed.event) {
      const event = parsed.event;
      
      // Ignore messages from bots to prevent loops
      if (event.type === 'message' && event.bot_id) {
        return c.json({ ok: true });
      }

      if (event.type === 'app_mention' || event.type === 'message') {
        if (!event.user || !event.channel || !event.text || !event.ts) {
          return c.json({ error: 'Incomplete event data' }, 400);
        }

        // Strip the bot mention from the text if it's an app_mention
        const text = event.type === 'app_mention' 
          ? event.text.replace(/<@U[A-Z0-9]+>/g, '').trim()
          : event.text;

        await gateway.handleInbound({
          channelType: 'slack',
          externalUserId: event.user,
          externalChannelId: event.channel,
          externalThreadId: event.thread_ts || event.ts, // Thread to keep conversation context
          externalMessageId: event.ts,
          text,
          receivedAt: new Date().toISOString(),
          rawEvent: body,
        });
      }
    }

    return c.json({ ok: true });
  });

  // Interactivity: https://api.slack.com/interactivity
  app.post('/interactive', async (c) => {
    const formData = await c.req.formData();
    const payloadRaw = formData.get('payload');
    if (typeof payloadRaw !== 'string') {
      return c.json({ error: 'Missing payload' }, 400);
    }

    const body = JSON.parse(payloadRaw);
    const parsed = SlackInteractionSchema.parse(body);

    const sessionId = sessionMapper.mapToSessionId({
      channelType: 'slack',
      externalUserId: parsed.user.id,
      externalChannelId: parsed.channel.id,
      externalThreadId: parsed.container.thread_ts || parsed.container.message_ts,
    });

    for (const action of parsed.actions) {
      await gateway.handleAction('slack', sessionId, action.action_id);
    }

    return c.json({ ok: true });
  });

  return app;
}
