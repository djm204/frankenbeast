import type { 
  ChannelAdapter, 
  ChannelOutboundMessage, 
  ChannelCapabilities,
  ChannelType
} from '../../core/types.js';
import { formatHttpErrorMessage } from '../http-error-context.js';
import { createEgressGuardedFetch, type EgressPolicyConfig } from '../../../network/egress-policy.js';

export interface WhatsAppAdapterOptions {
  egressPolicy?: EgressPolicyConfig | undefined;
  fetchImpl?: typeof fetch | undefined;
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

  private readonly fetchImpl: typeof fetch;

  constructor(options: WhatsAppAdapterOptions) {
    this.accessToken = options.accessToken;
    this.phoneNumberId = options.phoneNumberId;
    this.fetchImpl = options.fetchImpl ?? createEgressGuardedFetch({ lane: 'operator', policy: options.egressPolicy });
  }

  async send(sessionId: string, message: ChannelOutboundMessage): Promise<void> {
    const to = (message.metadata?.phoneNumber as string) || 'unknown';
    const body = this.formatPayload(to, message);

    const targetUrl = `https://graph.facebook.com/v21.0/${this.phoneNumberId}/messages`;
    const response = await this.fetchImpl(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.accessToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(await formatHttpErrorMessage('WhatsApp API error', response, targetUrl));
    }
  }

  private appendProviderFooter(text: string, message: ChannelOutboundMessage): string {
    if (!message.provider) return text;
    const providerLine = message.provider.switchedFrom
      ? `[${message.provider.switchedFrom} → ${message.provider.name} (${message.provider.switchReason ?? 'failover'})]`
      : `[${message.provider.name}]`;
    return `${text}\n\n${providerLine}`;
  }

  private formatPayload(to: string, message: ChannelOutboundMessage): Record<string, unknown> {
    if (message.actions && message.actions.length > 0) {
      return {
        messaging_product: 'whatsapp',
        to,
        type: 'interactive',
        interactive: {
          type: 'button',
          body: { text: this.appendProviderFooter(message.text, message) },
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
      text: { body: this.appendProviderFooter(message.text, message) },
    };
  }
}
