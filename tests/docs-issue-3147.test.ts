import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = resolve(import.meta.dirname, '..');
const README = readFileSync(resolve(ROOT, 'README.md'), 'utf8');

describe('issue #3147 Telegram webhook migration docs', () => {
  it('documents the token-independent webhook route and secret header', () => {
    expect(README).toContain('/webhooks/telegram');
    expect(README).toContain('X-Telegram-Bot-Api-Secret-Token');
    expect(README).toContain('webhookSecretTokenRef');
    expect(README).not.toContain('| Telegram | Webhook | Token-based authentication |');
  });

  it('documents migration from token-bearing webhook URLs', () => {
    expect(README).toContain('Do not append the bot token to the webhook URL');
    expect(README).toContain('re-register the webhook');
    expect(README).toContain('rotate the bot token with BotFather');
    expect(README).toContain('secret_token');
  });
});
