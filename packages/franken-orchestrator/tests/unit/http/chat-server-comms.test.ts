import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import process from 'node:process';

vi.mock('../../../src/http/chat-app.js', () => {
  const { Hono } = require('hono') as typeof import('hono');
  return {
    createChatApp: vi.fn(() => new Hono()),
  };
});
vi.mock('../../../src/http/ws-chat-server.js', () => ({
  attachChatWebSocketServer: vi.fn(),
}));

import { startChatServer } from '../../../src/http/chat-server.js';
import { createChatApp } from '../../../src/http/chat-app.js';
import type { CommsConfig } from '../../../src/comms/config/comms-config.js';
import type { CommsRuntimePort } from '../../../src/comms/core/comms-runtime-port.js';
import type { ChatServerHandle } from '../../../src/http/chat-server.js';

const mockedCreateChatApp = vi.mocked(createChatApp);

describe('startChatServer comms pass-through', () => {
  let handle: ChatServerHandle | undefined;
  let tempDirs: string[] = [];

  beforeEach(() => {
    mockedCreateChatApp.mockClear();
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
    await Promise.all(tempDirs.map((dir) => rm(dir, { recursive: true, force: true })));
    tempDirs = [];
  });

  it('passes commsConfig and commsRuntime to createChatApp when provided', async () => {
    const commsConfig: CommsConfig = {
      orchestrator: {},
      channels: {},
    };
    const commsRuntime: CommsRuntimePort = {
      processInbound: vi.fn(),
    };

    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: '/tmp/chat-server-comms-test',
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      commsConfig,
      commsRuntime,
    });

    expect(mockedCreateChatApp).toHaveBeenCalledOnce();
    const opts = mockedCreateChatApp.mock.calls[0]![0];
    expect(opts).toHaveProperty('commsConfig', commsConfig);
    expect(opts).toHaveProperty('commsRuntime', commsRuntime);
  });

  it('passes network security config to createChatApp so comms can read webhook policy', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-server-security-config-'));
    tempDirs.push(dir);
    const configFile = join(dir, 'config.json');
    let config: {
      security: {
        profile: 'strict' | 'standard' | 'permissive';
        webhookSignaturePolicy: 'required' | 'local-dev-unsigned';
        customRules?: Array<{ name: string; pattern: string; action: 'block' | 'warn' | 'log'; target: 'request' | 'response' | 'both' }>;
      };
    } = {
      security: {
        profile: 'permissive',
        webhookSignaturePolicy: 'local-dev-unsigned',
      },
    };

    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: '/tmp/chat-server-comms-test',
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      commsConfig: { orchestrator: {}, channels: {} },
      networkControl: {
        root: '/tmp/project',
        frankenbeastDir: '/tmp/project/.frankenbeast',
        configFile,
        getConfig: () => config as never,
        setConfig: (next) => {
          config = next as typeof config;
        },
      },
    });

    const opts = mockedCreateChatApp.mock.calls[0]![0];
    expect(opts.securityConfig?.getSecurityConfig().webhookSignaturePolicy).toBe('local-dev-unsigned');

    opts.securityConfig?.setSecurityConfig({
      webhookSignaturePolicy: 'required',
      customRules: [{ name: 'no-secrets', pattern: 'secret', action: 'block', target: 'request' }],
    });
    expect(config.security.webhookSignaturePolicy).toBe('required');
    expect(config.security.customRules).toEqual([{ name: 'no-secrets', pattern: 'secret', action: 'block', target: 'request' }]);
    expect(opts.securityConfig?.getSecurityConfig().customRules).toEqual([
      { name: 'no-secrets', pattern: 'secret', action: 'block', target: 'request' },
    ]);
    const writtenConfig = await readFile(configFile, 'utf-8');
    expect(writtenConfig).toContain('"webhookSignaturePolicy": "required"');
    expect(writtenConfig).toContain('"customRules"');
  });

  it('fails closed when managed mode exposes unsigned external webhooks', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-server-unsigned-webhooks-'));
    tempDirs.push(dir);
    const previous = process.env['FRANKENBEAST_NETWORK_MANAGED'];
    process.env['FRANKENBEAST_NETWORK_MANAGED'] = '1';
    try {
      await expect(startChatServer({
        host: '127.0.0.1',
        port: 0,
        sessionStoreDir: '/tmp/chat-server-comms-test',
        llm: { complete: vi.fn().mockResolvedValue('ok') },
        projectName: 'test',
        operatorToken: 'operator-token',
        commsConfig: {
          orchestrator: {},
          channels: {
            slack: {
              enabled: true,
              token: 'slack-token',
              signingSecret: 'slack-signing-secret',
            },
          },
        },
        networkControl: {
          root: '/tmp/project',
          frankenbeastDir: '/tmp/project/.frankenbeast',
          configFile: join(dir, 'config.json'),
          getConfig: () => ({
            security: {
              profile: 'permissive',
              webhookSignaturePolicy: 'local-dev-unsigned',
            },
          }) as never,
          setConfig: vi.fn(),
        },
      })).rejects.toThrow(/unsigned external webhooks/i);
    } finally {
      if (previous === undefined) {
        delete process.env['FRANKENBEAST_NETWORK_MANAGED'];
      } else {
        process.env['FRANKENBEAST_NETWORK_MANAGED'] = previous;
      }
    }
  });

  it('fails closed on exposed hosts before disabling Slack, Discord, or WhatsApp signatures', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-server-exposed-webhooks-'));
    tempDirs.push(dir);

    await expect(startChatServer({
      host: '0.0.0.0',
      port: 0,
      sessionStoreDir: '/tmp/chat-server-comms-test',
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      operatorToken: 'operator-token',
      commsConfig: {
        orchestrator: {},
        channels: {
          slack: {
            enabled: true,
            token: 'slack-token',
            signingSecret: 'slack-signing-secret',
          },
          discord: {
            enabled: true,
            token: 'discord-token',
            publicKey: 'discord-public-key',
          },
          whatsapp: {
            enabled: true,
            accessToken: 'whatsapp-token',
            phoneNumberId: 'phone-number-id',
            appSecret: 'whatsapp-app-secret',
            verifyToken: 'whatsapp-verify-token',
          },
        },
      },
      networkControl: {
        root: '/tmp/project',
        frankenbeastDir: '/tmp/project/.frankenbeast',
        configFile: join(dir, 'config.json'),
        getConfig: () => ({
          security: {
            profile: 'permissive',
            webhookSignaturePolicy: 'local-dev-unsigned',
          },
        }) as never,
        setConfig: vi.fn(),
      },
    })).rejects.toThrow(/slack, discord, whatsapp webhooks require signature verification/i);

    expect(mockedCreateChatApp).not.toHaveBeenCalled();
  });

  it('allows unsigned external webhooks on loopback-only local development', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'chat-server-local-webhooks-'));
    tempDirs.push(dir);

    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: '/tmp/chat-server-comms-test',
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      commsConfig: {
        orchestrator: {},
        channels: {
          slack: {
            enabled: true,
            token: 'slack-token',
            signingSecret: 'slack-signing-secret',
          },
        },
      },
      networkControl: {
        root: '/tmp/project',
        frankenbeastDir: '/tmp/project/.frankenbeast',
        configFile: join(dir, 'config.json'),
        getConfig: () => ({
          security: {
            profile: 'permissive',
            webhookSignaturePolicy: 'local-dev-unsigned',
          },
        }) as never,
        setConfig: vi.fn(),
      },
    });

    expect(mockedCreateChatApp).toHaveBeenCalledOnce();
  });

  it('creates a chat-runtime comms adapter when commsConfig is provided without a runtime', async () => {
    const commsConfig: CommsConfig = {
      orchestrator: {},
      channels: {},
    };

    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: '/tmp/chat-server-comms-test',
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      commsConfig,
    });

    expect(mockedCreateChatApp).toHaveBeenCalledOnce();
    const opts = mockedCreateChatApp.mock.calls[0]![0];
    expect(opts).toHaveProperty('commsConfig', commsConfig);
    expect(opts.commsRuntime).toEqual(expect.objectContaining({
      processInbound: expect.any(Function),
    }));
  });

  it('stores auto-wired comms sessions under encoded ids and preserves routing metadata', async () => {
    const sessionStoreDir = await mkdtemp(join(tmpdir(), 'chat-server-comms-store-'));
    tempDirs.push(sessionStoreDir);
    const commsConfig: CommsConfig = {
      orchestrator: {},
      channels: {},
    };

    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      commsConfig,
    });

    const opts = mockedCreateChatApp.mock.calls[0]![0];
    await opts.commsRuntime!.processInbound({
      sessionId: 'slack/team/thread',
      channelType: 'slack',
      text: '/status',
      externalUserId: 'U123',
      metadata: { externalChannelId: 'C123', externalThreadId: '171234.000100' },
    });

    expect(await readdir(sessionStoreDir)).toEqual(['slack%2Fteam%2Fthread.json']);
    const stored = handle.sessionStore.get('slack%2Fteam%2Fthread') as { routingMetadata?: Record<string, unknown> } | undefined;
    expect(stored?.routingMetadata).toEqual(expect.objectContaining({
      channelId: 'C123',
      threadTs: '171234.000100',
    }));
    expect(handle.sessionStore.get('slack/team/thread')).toBeUndefined();
  });

  it('loads legacy encoded comms sessions before creating a shared chat session', async () => {
    const sessionStoreDir = await mkdtemp(join(tmpdir(), 'chat-server-comms-legacy-'));
    tempDirs.push(sessionStoreDir);
    await mkdir(join(sessionStoreDir, 'comms'));
    await writeFile(join(sessionStoreDir, 'comms', `${encodeURIComponent('slack/team/thread')}.json`), JSON.stringify({
      sessionId: 'slack/team/thread',
      projectId: 'legacy-project',
      transcript: [{ role: 'assistant', content: 'approval pending', timestamp: '2026-07-04T00:00:00.000Z' }],
      state: 'pending_approval',
      pendingApproval: { description: 'legacy approval', requestedAt: '2026-07-04T00:00:00.000Z' },
      routingMetadata: { channelId: 'C-legacy', threadTs: '123.456' },
    }), 'utf-8');

    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir,
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
      commsConfig: { orchestrator: {}, channels: {} },
    });

    const opts = mockedCreateChatApp.mock.calls[0]![0];
    await opts.commsRuntime!.processInbound({
      sessionId: 'slack/team/thread',
      channelType: 'slack',
      text: '/approve',
      externalUserId: 'U123',
    });

    const stored = handle.sessionStore.get('slack%2Fteam%2Fthread') as { routingMetadata?: Record<string, unknown>; transcript?: unknown[] } | undefined;
    expect(stored?.routingMetadata).toEqual(expect.objectContaining({ channelId: 'C-legacy', threadTs: '123.456' }));
    expect(stored?.transcript).toEqual(expect.arrayContaining([
      expect.objectContaining({ content: 'approval pending' }),
    ]));
  });

  it('does not pass commsConfig or commsRuntime when not provided', async () => {
    handle = await startChatServer({
      host: '127.0.0.1',
      port: 0,
      sessionStoreDir: '/tmp/chat-server-comms-test',
      llm: { complete: vi.fn().mockResolvedValue('ok') },
      projectName: 'test',
    });

    expect(mockedCreateChatApp).toHaveBeenCalledOnce();
    const opts = mockedCreateChatApp.mock.calls[0]![0];
    expect(opts).not.toHaveProperty('commsConfig');
    expect(opts).not.toHaveProperty('commsRuntime');
  });

  it('accepts a beastDaemon operator token for managed startup and chat app auth', async () => {
    const previous = process.env['FRANKENBEAST_NETWORK_MANAGED'];
    process.env['FRANKENBEAST_NETWORK_MANAGED'] = '1';
    try {
      handle = await startChatServer({
        host: '127.0.0.1',
        port: 0,
        sessionStoreDir: '/tmp/chat-server-daemon-test',
        llm: { complete: vi.fn().mockResolvedValue('ok') },
        projectName: 'test',
        beastDaemon: {
          baseUrl: 'http://127.0.0.1:4050',
          operatorToken: 'daemon-token',
        },
      });
    } finally {
      if (previous === undefined) {
        delete process.env['FRANKENBEAST_NETWORK_MANAGED'];
      } else {
        process.env['FRANKENBEAST_NETWORK_MANAGED'] = previous;
      }
    }

    expect(mockedCreateChatApp).toHaveBeenCalledOnce();
    const opts = mockedCreateChatApp.mock.calls[0]![0];
    expect(opts.beastDaemon).toEqual({
      baseUrl: 'http://127.0.0.1:4050',
      operatorToken: 'daemon-token',
    });
  });
});
