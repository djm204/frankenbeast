import { describe, expect, it } from 'vitest';
import { resolveCommsServerConfig } from '../../src/server/start-comms-server.js';

describe('managed comms config', () => {
  it('uses standalone config when no override is passed', () => {
    const config = resolveCommsServerConfig({
      orchestrator: { wsUrl: 'ws://127.0.0.1:3000/v1/chat/ws' },
      channels: {
        slack: {
          enabled: true,
          token: 'standalone-token',
          signingSecret: 'standalone-secret',
        },
      },
    });

    expect(config.orchestrator.wsUrl).toBe('ws://127.0.0.1:3000/v1/chat/ws');
    expect(config.channels.slack?.enabled).toBe(true);
  });

  it('applies managed overrides over standalone config', () => {
    const config = resolveCommsServerConfig(
      {
        orchestrator: { wsUrl: 'ws://127.0.0.1:3000/v1/chat/ws', token: 'standalone-token' },
        channels: {
          slack: {
            enabled: false,
          },
        },
      },
      {
        orchestrator: { wsUrl: 'ws://127.0.0.1:4242/v1/chat/ws' },
        channels: {
          slack: {
            enabled: true,
            token: 'managed-token',
            signingSecret: 'managed-secret',
          },
        },
      },
    );

    expect(config.orchestrator.wsUrl).toBe('ws://127.0.0.1:4242/v1/chat/ws');
    expect(config.channels.slack?.enabled).toBe(true);
    expect(config.channels.slack?.token).toBe('managed-token');
    expect(config.channels.slack?.signingSecret).toBe('managed-secret');
  });
});
