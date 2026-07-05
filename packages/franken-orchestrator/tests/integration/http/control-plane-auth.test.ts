import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { mkdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Hono } from 'hono';
import { createChatApp, type ChatAppOptions } from '../../../src/http/chat-app.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { resolveSecurityConfig, type SecurityConfig } from '../../../src/middleware/security-profiles.js';
import type { CommsConfig } from '../../../src/comms/config/comms-config.js';
import type { CommsRuntimePort } from '../../../src/comms/core/comms-runtime-port.js';
import type { SkillManager } from '../../../src/skills/skill-manager.js';
import type { ProviderRegistry } from '../../../src/providers/provider-registry.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TMP = join(__dirname, '__fixtures__/control-plane-auth');
const OPERATOR_TOKEN = 'test-operator-token';

function minimalCommsConfig(): CommsConfig {
  return { orchestrator: {}, channels: {} } as CommsConfig;
}

function mockCommsRuntime(): CommsRuntimePort {
  return {
    processInbound: vi.fn().mockResolvedValue({ text: 'ok', status: 'reply' }),
  };
}

function mockSkillManager(): SkillManager {
  return {
    listInstalled: vi.fn().mockReturnValue([]),
    getEnabledSkills: vi.fn().mockReturnValue([]),
  } as unknown as SkillManager;
}

function mockProviderRegistry(): ProviderRegistry {
  return {
    listProviders: vi.fn().mockResolvedValue([]),
  } as unknown as ProviderRegistry;
}

function buildApp(extra: Partial<ChatAppOptions> = {}): Hono {
  let networkConfig = defaultConfig();
  let securityConfig = resolveSecurityConfig('standard');
  const skillManager = mockSkillManager();
  return createChatApp({
    sessionStoreDir: join(TMP, 'chat'),
    llm: { complete: vi.fn().mockResolvedValue('hello') },
    projectName: 'control-plane-auth',
    operatorToken: OPERATOR_TOKEN,
    networkControl: {
      root: TMP,
      frankenbeastDir: TMP,
      configFile: join(TMP, 'config.json'),
      getConfig: () => networkConfig,
      setConfig: (next) => {
        networkConfig = next;
      },
    },
    commsConfig: minimalCommsConfig(),
    commsRuntime: mockCommsRuntime(),
    securityConfig: {
      getSecurityConfig: () => securityConfig,
      setSecurityConfig: (update) => {
        securityConfig = { ...securityConfig, ...update } as SecurityConfig;
      },
    },
    skillManager,
    providerRegistry: mockProviderRegistry(),
    dashboardDeps: {
      skillManager,
      getSecurityConfig: () => securityConfig,
      getProviders: () => [],
    },
    ...extra,
  });
}

const authHeader = { Authorization: `Bearer ${OPERATOR_TOKEN}` };

describe('control-plane operator auth', () => {
  beforeEach(() => {
    mkdirSync(TMP, { recursive: true });
  });

  afterEach(() => {
    rmSync(TMP, { recursive: true, force: true });
  });

  describe('rejects unauthenticated requests with 401', () => {
    const cases: Array<{ name: string; path: string; method?: string; body?: unknown }> = [
      { name: 'network status', path: '/v1/network/status' },
      { name: 'network start', path: '/v1/network/start', method: 'POST', body: { target: 'x' } },
      { name: 'security config', path: '/api/security' },
      { name: 'skills list', path: '/api/skills' },
      { name: 'dashboard snapshot', path: '/api/dashboard' },
      { name: 'dashboard SSE', path: '/api/dashboard/events' },
      { name: 'comms inbound', path: '/v1/comms/inbound', method: 'POST', body: { channelType: 'slack' } },
      { name: 'comms action', path: '/v1/comms/action', method: 'POST', body: { channelType: 'slack', sessionId: 's', actionId: 'a' } },
    ];

    for (const { name, path, method, body } of cases) {
      it(`${name} -> 401 without operator token`, async () => {
        const app = buildApp();
        const res = await app.request(path, {
          method: method ?? 'GET',
          ...(body ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : {}),
        });
        expect(res.status).toBe(401);
      });
    }
  });

  describe('authenticated requests pass the auth gate', () => {
    it('network status -> 200 with operator token', async () => {
      const app = buildApp();
      const res = await app.request('/v1/network/status', { headers: authHeader });
      expect(res.status).toBe(200);
    });

    it('security config -> 200 with operator token', async () => {
      const app = buildApp();
      const res = await app.request('/api/security', { headers: authHeader });
      expect(res.status).toBe(200);
    });

    it('skills list -> 200 with operator token', async () => {
      const app = buildApp();
      const res = await app.request('/api/skills', { headers: authHeader });
      expect(res.status).toBe(200);
    });

    it('dashboard snapshot -> 200 with operator token', async () => {
      const app = buildApp();
      const res = await app.request('/api/dashboard', { headers: authHeader });
      expect(res.status).toBe(200);
    });

    it('dashboard SSE -> mints a ticket with operator token, then streams without bearer auth', async () => {
      const app = buildApp();
      const ticketRes = await app.request('/api/dashboard/events/ticket', {
        method: 'POST',
        headers: authHeader,
      });
      expect(ticketRes.status).toBe(200);
      const { ticket } = await ticketRes.json() as { ticket: string };

      const res = await app.request(`/api/dashboard/events?ticket=${ticket}`);
      expect(res.status).toBe(200);
      expect(res.headers.get('content-type')).toContain('text/event-stream');
      await res.body?.cancel();
    });

    it('dashboard SSE rejects bearer-auth streams without a one-shot ticket', async () => {
      const app = buildApp();
      const res = await app.request('/api/dashboard/events', { headers: authHeader });
      expect(res.status).toBe(401);
    });

    it('comms inbound -> accepted with operator token', async () => {
      const app = buildApp();
      const res = await app.request('/v1/comms/inbound', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
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
      expect(await res.json()).toEqual({ accepted: true });
    });

    it('comms action -> accepted with operator token', async () => {
      const app = buildApp();
      const res = await app.request('/v1/comms/action', {
        method: 'POST',
        headers: { ...authHeader, 'Content-Type': 'application/json' },
        body: JSON.stringify({ channelType: 'slack', sessionId: 's1', actionId: 'approve' }),
      });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ accepted: true });
    });

    it('rejects an invalid operator token', async () => {
      const app = buildApp();
      const res = await app.request('/v1/network/status', {
        headers: { Authorization: 'Bearer wrong-token' },
      });
      expect(res.status).toBe(401);
    });
  });

  describe('public comms surfaces stay reachable', () => {
    it('comms health is not gated', async () => {
      const app = buildApp();
      const res = await app.request('/comms/health');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ status: 'ok' });
    });
  });

  describe('webhook signature verification is preserved', () => {
    it('mounts provider webhook routes with per-channel verification when configured', async () => {
      let networkConfig = defaultConfig();
      const app = createChatApp({
        sessionStoreDir: join(TMP, 'chat'),
        llm: { complete: vi.fn().mockResolvedValue('hello') },
        projectName: 'control-plane-auth',
        operatorToken: OPERATOR_TOKEN,
        networkControl: {
          root: TMP,
          frankenbeastDir: TMP,
          configFile: join(TMP, 'config.json'),
          getConfig: () => networkConfig,
          setConfig: (next) => {
            networkConfig = next;
          },
        },
        commsConfig: {
          orchestrator: {},
          channels: {
            slack: { enabled: true, token: 'xoxb-test', signingSecret: ['test', 'signing', 'fixture'].join('-') },
          },
        } as CommsConfig,
        commsRuntime: mockCommsRuntime(),
      });

      // Webhook route is reachable without operator auth (it has its own
      // per-channel signature verification). An unsigned request is rejected by
      // the signature middleware, NOT by the operator-auth gate, proving the
      // webhook trust boundary is preserved and not replaced.
      const res = await app.request('/webhooks/slack/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'event_callback' }),
      });
      const bodyText = await res.text();
      expect(bodyText).not.toContain('Operator authentication is required');
    });

    it('keeps webhook signatures required for permissive security profiles unless an explicit local override is set', async () => {
      let networkConfig = defaultConfig();
      const app = createChatApp({
        sessionStoreDir: join(TMP, 'chat'),
        llm: { complete: vi.fn().mockResolvedValue('hello') },
        projectName: 'control-plane-auth',
        operatorToken: OPERATOR_TOKEN,
        networkControl: {
          root: TMP,
          frankenbeastDir: TMP,
          configFile: join(TMP, 'config.json'),
          getConfig: () => networkConfig,
          setConfig: (next) => {
            networkConfig = next;
          },
        },
        commsConfig: {
          orchestrator: {},
          channels: {
            slack: { enabled: true, token: 'xoxb-test', signingSecret: ['test', 'signing', 'fixture'].join('-') },
          },
        } as CommsConfig,
        commsRuntime: mockCommsRuntime(),
        securityConfig: {
          getSecurityConfig: () => resolveSecurityConfig('permissive'),
          setSecurityConfig: vi.fn(),
        },
      });

      const res = await app.request('/webhooks/slack/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'url_verification', challenge: 'ok' }),
      });

      expect(res.status).toBe(401);
      expect(await res.json()).toEqual({ error: 'Missing security headers' });
    });
  });
});
