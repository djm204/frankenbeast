import type { 
  ChannelAdapter, 
  ChannelOutboundMessage, 
  ChannelCapabilities,
  ChannelType
} from '../../core/types.js';

export interface TelegramAdapterOptions {
  token: string;
}

export class TelegramAdapter implements ChannelAdapter {
  readonly type: ChannelType = 'telegram';
  readonly capabilities: ChannelCapabilities = {
    threads: false, // Simple groups might have topics later
    buttons: true, // Inline keyboards
    slashCommands: true, // Native commands
    richBlocks: false, // Markup only
    fileUpload: true,
    markdownFlavor: 'telegram',
  };

  private readonly token: string;

  constructor(options: TelegramAdapterOptions) {
    this.token = options.token;
  }

  async send(sessionId: string, message: ChannelOutboundMessage): Promise<void> {
    const chatId = (message.metadata?.chatId as string) || 'unknown';
    const body = this.formatPayload(chatId, message);

    const response = await fetch(`https://api.telegram.org/bot${this.token}/sendMessage`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${response.status} ${error}`);
    }
  }

  private formatPayload(chatId: string, message: ChannelOutboundMessage): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      chat_id: chatId,
      text: this.escapeMarkdown(message.text),
      parse_mode: 'MarkdownV2',
    };

    if (message.actions && message.actions.length > 0) {
      payload.reply_markup = {
        inline_keyboard: [
          message.actions.map((action) => ({
            text: action.label,
            callback_data: action.id,
          })),
        ],
      };
    }

    if (message.provider) {
      const providerLine = message.provider.switchedFrom
        ? `_${this.escapeMarkdown(message.provider.switchedFrom)} → ${this.escapeMarkdown(message.provider.name)}_ \\(${this.escapeMarkdown(message.provider.switchReason ?? 'failover')}\\)`
        : `_${this.escapeMarkdown(message.provider.name)}_`;
      payload['text'] = `${payload['text'] as string}\n\n${providerLine}`;
    }

    return payload;
  }

  private escapeMarkdown(text: string): string {
    // Basic escape for Telegram MarkdownV2
    return text.replace(/[_*[\]()~`>#+\-=|{}.!]/g, '\\$&');
  }
}
