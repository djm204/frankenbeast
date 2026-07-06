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

  it('rejects oversized generic comms inbound JSON before parsing', async () => {
    const app = commsRoutes({ config: minimalConfig(), runtime: mockRuntime() });
    const oversizedBody = JSON.stringify({
      channelType: 'slack',
      externalUserId: 'U1',
      externalChannelId: 'C1',
      externalMessageId: 'M1',
      text: 'x'.repeat(20 * 1024),
      receivedAt: new Date().toISOString(),
      rawEvent: {},
    });

    const res = await app.request('/v1/comms/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': String(oversizedBody.length) },
      body: oversizedBody,
    });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({
      error: {
        code: 'PAYLOAD_TOO_LARGE',
        message: 'Request body exceeds 16384 bytes',
        details: { maxSize: 16384 },
      },
    });
  });

  it('rejects chunked generic comms action JSON without a content length when it exceeds the body limit', async () => {
    const app = commsRoutes({ config: minimalConfig(), runtime: mockRuntime() });
    const oversizedBody = JSON.stringify({
      channelType: 'slack',
      sessionId: 's1',
      actionId: 'approve',
      padding: 'x'.repeat(20 * 1024),
    });
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(oversizedBody.slice(0, 512)));
        controller.enqueue(new TextEncoder().encode(oversizedBody.slice(512)));
        controller.close();
      },
    });

    const res = await app.request('/v1/comms/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: stream,
      duplex: 'half',
    } as RequestInit);

    expect(res.status).toBe(413);
    expect(await res.json()).toMatchObject({ error: { code: 'PAYLOAD_TOO_LARGE' } });
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
          slack: { enabled: true, token: 'xoxb-test', signingSecret: ['test', 'signing', 'fixture'].join('-') },
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
          slack: { enabled: true, token: 'xoxb-test', signingSecret: ['test', 'signing', 'fixture'].join('-') },
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
    expect(external.status).toBe(401);
    expect(await external.json()).toEqual({ error: 'Missing security headers' });

    const trustedIpv6Loopback = await app.request('http://[::1]/webhooks/slack/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'ipv6-ok' }),
    });
    expect(trustedIpv6Loopback.status).toBe(200);
    expect(await trustedIpv6Loopback.json()).toEqual({ challenge: 'ipv6-ok' });
  });

  it('requires signatures when trusted remote address or proxy headers show external traffic', async () => {
    const app = commsRoutes({
      config: minimalConfig({
        channels: {
          slack: { enabled: true, token: 'xoxb-test', signingSecret: ['test', 'signing', 'fixture'].join('-') },
        },
      }),
      runtime: mockRuntime(),
      webhookSignaturePolicy: 'local-dev-unsigned',
    });

    const spoofedHost = await app.request('http://localhost/webhooks/slack/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-frankenbeast-remote-address': '203.0.113.10',
      },
      body: JSON.stringify({ type: 'url_verification', challenge: 'blocked' }),
    });
    expect(spoofedHost.status).toBe(401);
    expect(await spoofedHost.json()).toEqual({ error: 'Missing security headers' });

    const proxiedExternal = await app.request('https://public.example/webhooks/slack/events', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-frankenbeast-remote-address': '127.0.0.1',
        'x-forwarded-for': '203.0.113.10',
      },
      body: JSON.stringify({ type: 'url_verification', challenge: 'blocked' }),
    });
    expect(proxiedExternal.status).toBe(401);
    expect(await proxiedExternal.json()).toEqual({ error: 'Missing security headers' });
  });

  it('re-evaluates webhook signature policy for each request', async () => {
    let webhookSignaturePolicy: 'required' | 'local-dev-unsigned' = 'local-dev-unsigned';
    const app = commsRoutes({
      config: minimalConfig({
        channels: {
          slack: { enabled: true, token: 'xoxb-test', signingSecret: ['test', 'signing', 'fixture'].join('-') },
        },
      }),
      runtime: mockRuntime(),
      getWebhookSignaturePolicy: () => webhookSignaturePolicy,
    });

    const localUnsigned = await app.request('http://localhost/webhooks/slack/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'ok' }),
    });
    expect(localUnsigned.status).toBe(200);

    webhookSignaturePolicy = 'required';
    const nowRequired = await app.request('http://localhost/webhooks/slack/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'url_verification', challenge: 'blocked' }),
    });
    expect(nowRequired.status).toBe(401);
    expect(await nowRequired.json()).toEqual({ error: 'Missing security headers' });
  });

  it('throws when runtime is not provided', () => {
    expect(() => commsRoutes({ config: minimalConfig() })).toThrow('CommsRuntimePort');
  });

  it('requires the Telegram secret_token header before accepting updates', async () => {
    const webhookSecretToken = 'telegram-webhook-secret';
    const app = commsRoutes({
      config: minimalConfig({
        channels: {
          telegram: {
            enabled: true,
            botToken: '123456:secret-token',
            webhookSecretToken,
          },
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

    const missingHeader = await app.request('/webhooks/telegram', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    expect(missingHeader.status).toBe(404);

    const tokenPath = await app.request('/webhooks/telegram/123456:secret-token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
      body: JSON.stringify(body),
    });
    expect(tokenPath.status).toBe(404);

    const exact = await app.request('/webhooks/telegram', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Telegram-Bot-Api-Secret-Token': webhookSecretToken,
      },
      body: JSON.stringify(body),
    });
    expect(exact.status).toBe(200);
  });
});
