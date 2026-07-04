import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

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
