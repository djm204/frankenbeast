import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';

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

  beforeEach(() => {
    mockedCreateChatApp.mockClear();
  });

  afterEach(async () => {
    if (handle) {
      await handle.close();
      handle = undefined;
    }
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
