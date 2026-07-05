import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/comms/channels/slack/slack-adapter.js', () => ({
  SlackAdapter: vi.fn(),
}));
vi.mock('../../../src/comms/channels/discord/discord-adapter.js', () => ({
  DiscordAdapter: vi.fn(),
}));
vi.mock('../../../src/comms/channels/telegram/telegram-adapter.js', () => ({
  TelegramAdapter: vi.fn(),
}));
vi.mock('../../../src/comms/channels/whatsapp/whatsapp-adapter.js', () => ({
  WhatsAppAdapter: vi.fn(),
}));

import { commsRoutes } from '../../../src/http/routes/comms-routes.js';
import type { CommsConfig } from '../../../src/comms/config/comms-config.js';
import type { CommsRuntimePort } from '../../../src/comms/core/comms-runtime-port.js';

function minimalConfig(overrides?: Partial<CommsConfig>): CommsConfig {
  return {
    orchestrator: {},
    channels: {},
    ...overrides,
  } as CommsConfig;
}

function mockRuntime(): CommsRuntimePort {
  return {
    processInbound: vi.fn().mockResolvedValue({ text: 'ok', status: 'reply' }),
  };
}

describe('commsRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Hono app with health endpoint', async () => {
    const app = commsRoutes({ config: minimalConfig(), runtime: mockRuntime() });
    const res = await app.request('/comms/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('handles POST /v1/comms/inbound', async () => {
    const app = commsRoutes({ config: minimalConfig(), runtime: mockRuntime() });
    const res = await app.request('/v1/comms/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        channelType: 'slack',
        externalUserId: 'U1',
        externalChannelId: 'C1',
        externalMessageId: 'M1',
        text: 'hello',
        receivedAt: new Date().toISOString(),
        rawEvent: {},
      }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accepted: true });
  });

  it('handles POST /v1/comms/action', async () => {
    const app = commsRoutes({ config: minimalConfig(), runtime: mockRuntime() });
    const res = await app.request('/v1/comms/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channelType: 'slack', sessionId: 's1', actionId: 'approve' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accepted: true });
  });

  it('does not register channel routes when channels are disabled', async () => {
    const app = commsRoutes({ config: minimalConfig(), runtime: mockRuntime() });
    const res = await app.request('/webhooks/slack/events', { method: 'POST' });
    expect(res.status).toBe(404);
  });

  it('requires webhook signatures by default even when the security profile is permissive elsewhere', async () => {
    const app = commsRoutes({
      config: minimalConfig({
        channels: {
          slack: { enabled: true, token: 'xoxb-test', signingSecret: 'secret' },
        },
      }),
      runtime: mockRuntime(),
    });

    const res = await app.request('/webhooks/slack/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'ok' }),
    });

    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: 'Missing security headers' });
  });

  it('allows unsigned webhooks only for the explicit loopback development policy', async () => {
    const app = commsRoutes({
      config: minimalConfig({
        channels: {
          slack: { enabled: true, token: 'xoxb-test', signingSecret: 'secret' },
        },
      }),
      runtime: mockRuntime(),
      webhookSignaturePolicy: 'local-dev-unsigned',
    });

    const local = await app.request('http://localhost/webhooks/slack/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'ok' }),
    });
    expect(local.status).toBe(200);
    expect(await local.json()).toEqual({ challenge: 'ok' });

    const external = await app.request('https://example.com/webhooks/slack/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'ok' }),
    });
    expect(external.status).toBe(403);
    expect(await external.json()).toEqual({ error: 'Unsigned webhooks are only allowed on loopback hosts' });
  });

  it('throws when runtime is not provided', () => {
    expect(() => commsRoutes({ config: minimalConfig() })).toThrow('CommsRuntimePort');
  });

  it('requires the full Telegram token segment before accepting updates', async () => {
    const app = commsRoutes({
      config: minimalConfig({
        channels: {
          telegram: { enabled: true, botToken: '123456:secret-token' },
        },
      }),
      runtime: mockRuntime(),
    });

    const body = {
      update_id: 1,
      message: {
        message_id: 10,
        date: 1,
        text: 'hello',
        chat: { id: 123456, type: 'private' },
        from: { id: 42, is_bot: false, first_name: 'Ada' },
      },
    };
    const headers = { 'Content-Type': 'application/json' };

    const partial = await app.request('/webhooks/telegram/123456anything', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    expect(partial.status).toBe(404);

    const exact = await app.request('/webhooks/telegram/123456:secret-token', {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    expect(exact.status).toBe(200);
  });
});
