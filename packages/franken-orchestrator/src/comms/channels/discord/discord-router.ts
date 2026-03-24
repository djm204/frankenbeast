import { Hono } from 'hono';
import { discordSignatureMiddleware } from '../../security/discord-signature.js';
import { DiscordInteractionSchema, DiscordInteractionType } from './discord-schemas.js';
import type { ChatGateway } from '../../gateway/chat-gateway.js';
import type { SessionMapper } from '../../core/session-mapper.js';

export interface DiscordRouterOptions {
  gateway: ChatGateway;
  sessionMapper: SessionMapper;
  publicKey: string;
  verifySignature?: boolean;
}

export function discordRouter(options: DiscordRouterOptions) {
  const { gateway, sessionMapper, publicKey } = options;
  const app = new Hono();

  if (options.verifySignature !== false) {
    app.use('*', discordSignatureMiddleware({ publicKey }));
  }

  app.post('/interactions', async (c) => {
    const body = await c.req.json();
    const interaction = DiscordInteractionSchema.parse(body);

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

      await gateway.handleInbound({
        channelType: 'discord',
        externalUserId: userId,
        externalChannelId: channelId,
        externalMessageId: interaction.id,
        text,
        receivedAt: new Date().toISOString(),
        rawEvent: body,
      });

      // Acknowledge the interaction immediately to avoid timeout
      // In a real scenario, we might use a deferred response
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

      await gateway.handleAction('discord', sessionId, customId);

      return c.json({
        type: 4,
        data: { content: `Action ${customId} received.` },
      });
    }

    return c.json({ ok: true });
  });

  return app;
}
