import type { 
  ChannelAdapter, 
  ChannelOutboundMessage, 
  ChannelCapabilities,
  ChannelType
} from '../../core/types.js';

export interface WhatsAppAdapterOptions {
  accessToken: string;
  phoneNumberId: string;
}

export class WhatsAppAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'whatsapp';
  readonly capabilities: ChannelCapabilities = {
    threads: false,
    buttons: true, // Interactive buttons
    slashCommands: false,
    richBlocks: false,
    fileUpload: true,
    markdownFlavor: 'plain',
  };

  private readonly accessToken: string;
  private readonly phoneNumberId: string;

  constructor(options: WhatsAppAdapterOptions) {
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
  }

  async send(sessionId: string, message: ChannelOutboundMessage): Promise<void> {
    const to = (message.metadata?.phoneNumber as string) || 'unknown';
    const body = this.formatPayload(to, message);

    const response = await fetch(`https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`WhatsApp API error: ${response.status} ${error}`);
    }
  }

  private formatPayload(to: string, message: ChannelOutboundMessage): any {
    if (message.actions && message.actions.length > 0) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: message.text },
          action: {
            buttons: message.actions.map((action) => ({
              type: 'reply',
              reply: {
                id: action.id,
                title: action.label.slice(0, 20), // Max 20 chars
              },
            })),
          },
        },
      };
    }

    return {
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: message.text },
    };
  }
}
