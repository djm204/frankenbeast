import { Hono, type Context } from 'hono';
import { discordSignatureMiddleware } from '../../security/discord-signature.js';
import { DiscordInteractionSchema, DiscordInteractionType } from './discord-schemas.js';
import type { ChatGateway } from '../../gateway/chat-gateway.js';
import type { SessionMapper } from '../../core/session-mapper.js';
import { isoNow } from '@franken/types';

export interface DiscordRouterOptions {
  gateway: ChatGateway;
  sessionMapper: SessionMapper;
  publicKey: string;
  verifySignature?: boolean | ((c: Context) => boolean);
}

export function discordRouter(options: DiscordRouterOptions) {
  const { gateway, sessionMapper, publicKey } = options;
  const app = new Hono();

  const verify = discordSignatureMiddleware({ publicKey });
  app.use('*', async (c, next) => {
    if (!shouldVerifySignature(options.verifySignature, c)) {
      return next();
    }
    return verify(c, next);
  });

  app.post('/interactions', async (c) => {
    let body: unknown;
    try {
      body = await c.req.json();
    } catch {
      return c.json({ error: 'Malformed Discord payload' }, 400);
    }
    const interactionPayload = DiscordInteractionSchema.safeParse(body);
    if (!interactionPayload.success) {
      return c.json({ error: 'Invalid payload' }, 400);
    }
    const interaction = interactionPayload.data;

    // 1. Handle PING for interaction endpoint verification
    if (interaction.type === DiscordInteractionType.PING) {
      return c.json({ type: 1 });
    }

    const userId = interaction.member?.user.id || interaction.user?.id;
    const channelId = interaction.channel_id;

    if (!userId || !channelId) {
      return c.json({ error: 'Missing context' }, 400);
    }

    // 2. Handle Slash Commands
    if (interaction.type === DiscordInteractionType.APPLICATION_COMMAND) {
      const commandName = interaction.data?.name;
      const commandOptions = interaction.data?.options || [];
      const queryValue = commandOptions.find((opt) => opt.name === 'query')?.value;
      const query = typeof queryValue === 'string' ? queryValue : '';

      const text = commandName === 'franken' ? query : `/${commandName} ${query}`.trim();

      runGatewayTaskInBackground('Discord slash command processing', () =>
        gateway.handleInbound({
          channelType: 'discord',
          externalUserId: userId,
          externalChannelId: channelId,
          externalMessageId: interaction.id,
          text,
          receivedAt: isoNow(),
          rawEvent: body,
        }),
      );

      // Acknowledge the interaction immediately to avoid timeout.
      // Gateway processing continues in the background and follows up through the normal channel.
      return c.json({
        type: 4, // CHANNEL_MESSAGE_WITH_SOURCE
        data: { content: 'Processing your request...' },
      });
    }

    // 3. Handle Button Interactions
    if (interaction.type === DiscordInteractionType.MESSAGE_COMPONENT) {
      const customId = interaction.data?.custom_id;
      if (!customId) return c.json({ ok: true });

      const sessionId = sessionMapper.mapToSessionId({
        channelType: 'discord',
        externalUserId: userId,
        externalChannelId: channelId,
      });

      runGatewayTaskInBackground('Discord button action processing', () =>
        gateway.handleAction('discord', sessionId, customId),
      );

      return c.json({
        type: 4,
        data: { content: `Action ${customId} received.` },
      });
    }

    return c.json({ ok: true });
  });

  return app;
}

function shouldVerifySignature(verifySignature: DiscordRouterOptions['verifySignature'], c: Context): boolean {
  if (typeof verifySignature === 'function') {
    return verifySignature(c);
  }
  return verifySignature !== false;
}

function runGatewayTaskInBackground(label: string, task: () => Promise<void>): void {
  try {
    void task().catch((error: unknown) => {
      console.error(`[discord-router] ${label} failed`, error);
    });
  } catch (error) {
    console.error(`[discord-router] ${label} failed`, error);
  }
}
