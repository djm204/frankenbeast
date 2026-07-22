import type { 
  ChannelAdapter, 
  ChannelOutboundMessage, 
  ChannelCapabilities,
  ChannelType
} from '../../core/types.js';
import { redactTelegramBotTokenUrls } from '../../../security/telegram-redaction.js';
import { formatHttpErrorMessage } from '../http-error-context.js';
import { createEgressGuardedFetch, type EgressPolicyConfig } from '../../../network/egress-policy.js';
import { createBoundedFetch, type BoundedFetch } from '../bounded-fetch.js';

export interface TelegramAdapterOptions {
  egressPolicy?: EgressPolicyConfig | undefined;
  fetchImpl?: typeof fetch | undefined;
  timeoutMs?: number | undefined;
  token: string;
}

const CALLBACK_DATA_PREFIX = 'fb';

export function encodeTelegramCallbackData(sessionId: string, actionId: string): string {
  const encoded = `${CALLBACK_DATA_PREFIX}:${sessionId}:${actionId}`;
  return encoded.length <= 64 ? encoded : actionId;
}

export function decodeTelegramCallbackData(data: string): { actionId: string; sessionId?: string | undefined } {
  const prefix = `${CALLBACK_DATA_PREFIX}:`;
  if (!data.startsWith(prefix)) {
    return { actionId: data };
  }
  const remainder = data.slice(prefix.length);
  const separatorIndex = remainder.indexOf(':');
  if (separatorIndex < 0) {
    return { actionId: data };
  }
  const sessionId = remainder.slice(0, separatorIndex);
  const actionId = remainder.slice(separatorIndex + 1);
  return actionId && sessionId ? { actionId, sessionId } : { actionId: data };
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

  private readonly fetchImpl: BoundedFetch;

  constructor(options: TelegramAdapterOptions) {
    this.token = options.token;
    const fetchImpl = options.fetchImpl ?? createEgressGuardedFetch({ lane: 'operator', policy: options.egressPolicy });
    this.fetchImpl = createBoundedFetch(fetchImpl, { channel: 'Telegram', timeoutMs: options.timeoutMs });
  }

  async send(sessionId: string, message: ChannelOutboundMessage): Promise<void> {
    const chatId = message.metadata?.chatId;
    if (typeof chatId !== 'string' || chatId.trim().length === 0) {
      throw new Error('Telegram routing error: missing chatId metadata');
    }

    const body = this.formatPayload(sessionId, chatId, message);
    const targetUrl = `https://api.telegram.org/bot${this.token}/sendMessage`;

    await this.fetchImpl(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    }, async response => {
      if (!response.ok) {
        throw new Error(await formatHttpErrorMessage(
          'Telegram API error',
          response,
          targetUrl,
          { provider: 'telegram', redact: redactTelegramBotTokenUrls },
        ));
      }
    });
  }

  private formatPayload(sessionId: string, chatId: string, message: ChannelOutboundMessage): Record<string, unknown> {
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
            callback_data: encodeTelegramCallbackData(sessionId, action.id),
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
