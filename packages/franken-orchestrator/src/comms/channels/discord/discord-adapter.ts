import type { 
  ChannelAdapter, 
  ChannelOutboundMessage, 
  ChannelCapabilities,
  ChannelType
} from '../../core/types.js';

export interface DiscordAdapterOptions {
  token: string;
}

export class DiscordAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'discord';
  readonly capabilities: ChannelCapabilities = {
    threads: true,
    buttons: true,
    slashCommands: true,
    richBlocks: true,
    fileUpload: true,
    markdownFlavor: 'discord',
  };

  private readonly token: string;

  constructor(options: DiscordAdapterOptions) {
    this.token = options.token;
  }

  async send(sessionId: string, message: ChannelOutboundMessage): Promise<void> {
    // Discord interactions (replies to slash commands or buttons) 
    // often use an interaction token if within the window, 
    // but for general proactive messages or delayed execution results, 
    // we use the channel message API.
    
    const channelId = (message.metadata?.channelId as string) || 'unknown';
    const threadId = message.metadata?.threadId as string | undefined;

    const body = this.formatPayload(message);

    const targetUrl = threadId 
      ? `https://discord.com/api/v10/channels/${threadId}/messages`
      : `https://discord.com/api/v10/channels/${channelId}/messages`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bot ${this.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Discord API error: ${response.status} ${error}`);
    }
  }

  private formatPayload(message: ChannelOutboundMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      content: message.text,
      components: [],
    };

    if (message.actions && message.actions.length > 0) {
      (payload.components as unknown[]).push({
        type: 1, // Action Row
        components: message.actions.map((action) => ({
          type: 2, // Button
          label: action.label,
          style: action.style === 'primary' ? 1 : action.style === 'danger' ? 4 : 2,
          custom_id: action.id,
        })),
      });
    }

    // If it's an approval or progress, we can use an embed for better visuals
    if (message.status === 'approval' || message.status === 'progress') {
      payload.embeds = [
        {
          description: message.text,
          color: message.status === 'approval' ? 0xffaa00 : 0x00ff00,
          timestamp: new Date().toISOString(),
        }
      ];
      payload.content = ''; // Use embed description instead of content
    }

    return payload;
  }
}
