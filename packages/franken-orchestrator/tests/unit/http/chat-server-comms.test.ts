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
});
