import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/comms/gateway/chat-gateway.js', () => {
  class MockChatGateway {
    registerAdapter = vi.fn();
    handleInbound = vi.fn().mockResolvedValue(undefined);
    handleAction = vi.fn().mockResolvedValue(undefined);
  }
  return { ChatGateway: MockChatGateway };
});

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

function minimalConfig(overrides?: Partial<CommsConfig>): CommsConfig {
  return {
    orchestrator: { wsUrl: 'ws://localhost:4040' },
    channels: {},
    ...overrides,
  };
}

describe('commsRoutes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns a Hono app with health endpoint', async () => {
    const app = commsRoutes({ config: minimalConfig() });
    const res = await app.request('/comms/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ status: 'ok' });
  });

  it('handles POST /v1/comms/inbound', async () => {
    const app = commsRoutes({ config: minimalConfig() });
    const res = await app.request('/v1/comms/inbound', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ channel: 'slack', text: 'hello' }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ accepted: true });
  });

  it('handles POST /v1/comms/action', async () => {
    const app = commsRoutes({ config: minimalConfig() });
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
    const app = commsRoutes({ config: minimalConfig() });
    // No slack/discord/telegram/whatsapp routes registered
    const res = await app.request('/webhooks/slack/events', { method: 'POST' });
    expect(res.status).toBe(404);
  });
});
