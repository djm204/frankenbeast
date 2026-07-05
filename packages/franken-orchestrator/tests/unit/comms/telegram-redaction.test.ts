import { describe, expect, it } from 'vitest';
import { redactTelegramBotTokenUrls } from '../../../src/security/telegram-redaction.js';

describe('redactTelegramBotTokenUrls', () => {
  it('redacts Telegram bot-token request path segments', () => {
    const token = '123456789:AAExampleTelegramBotTokenSecretValue';

    expect(redactTelegramBotTokenUrls(`POST /webhooks/telegram/${token}`))
      .toBe('POST /webhooks/telegram/[REDACTED]');
    expect(redactTelegramBotTokenUrls(`POST /webhooks/telegram/${encodeURIComponent(token)}?x=1`))
      .toBe('POST /webhooks/telegram/[REDACTED]?x=1');
  });
});
