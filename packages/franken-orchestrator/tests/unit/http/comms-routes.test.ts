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

  it('throws when runtime is not provided', () => {
    expect(() => commsRoutes({ config: minimalConfig() })).toThrow('CommsRuntimePort');
  });
});
