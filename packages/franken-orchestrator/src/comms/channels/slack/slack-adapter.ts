import type { 
  ChannelAdapter, 
  ChannelOutboundMessage, 
  ChannelCapabilities,
  ChannelType
} from '../../core/types.js';

export interface SlackAdapterOptions {
  token: string;
}

export class SlackAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'slack';
  readonly capabilities: ChannelCapabilities = {
    threads: true,
    buttons: true,
    slashCommands: true,
    richBlocks: true,
    fileUpload: true,
    markdownFlavor: 'slack',
  };

  private readonly token: string;

  constructor(options: SlackAdapterOptions) {
    this.token = options.token;
  }

  async send(sessionId: string, message: ChannelOutboundMessage): Promise<void> {
    // In a real implementation, we would map sessionId back to Slack channel/thread
    // For now, we assume metadata contains the routing info or we have a store
    const channel = (message.metadata?.channelId as string) || 'unknown';
    const thread_ts = message.metadata?.threadTs as string | undefined;

    const blocks = this.formatBlocks(message);

    const response = await fetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.token}`,
      },
      body: JSON.stringify({
        channel,
        thread_ts,
        text: message.text, // Fallback text
        blocks,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Slack API error: ${response.status} ${error}`);
    }

    const result = await response.json() as { ok: boolean; error?: string };
    if (!result.ok) {
      throw new Error(`Slack API error: ${result.error}`);
    }
  }

  private formatBlocks(message: ChannelOutboundMessage): Record<string, unknown>[] {
    const blocks: Record<string, unknown>[] = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: message.text,
        },
      },
    ];

    if (message.actions && message.actions.length > 0) {
      blocks.push({
        type: 'actions',
        elements: message.actions.map((action) => ({
          type: 'button',
          text: {
            type: 'plain_text',
            text: action.label,
          },
          value: action.id,
          action_id: action.id,
          style: action.style === 'primary' ? 'primary' : action.style === 'danger' ? 'danger' : undefined,
        })),
      });
    }

    if (message.provider) {
      const providerText = message.provider.switchedFrom
        ? `_${message.provider.switchedFrom} → ${message.provider.name}_ (${message.provider.switchReason ?? 'failover'})`
        : `_${message.provider.name}_`;
      blocks.push({
        type: 'context',
        elements: [{ type: 'mrkdwn', text: providerText }],
      });
    }

    return blocks;
  }
}
