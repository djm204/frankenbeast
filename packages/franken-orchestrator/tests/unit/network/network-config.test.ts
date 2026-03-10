import { describe, expect, it } from 'vitest';
import { defaultNetworkConfig, NetworkConfigSchema } from '../../../src/network/network-config.js';
import { OrchestratorConfigSchema } from '../../../src/config/orchestrator-config.js';

describe('NetworkConfigSchema', () => {
  it('defaults to secure mode with local encrypted backend', () => {
    const config = defaultNetworkConfig();

    expect(config.network.mode).toBe('secure');
    expect(config.network.secureBackend).toBe('local-encrypted');
  });

  it('defaults service enablement and network ports', () => {
    const config = defaultNetworkConfig();

    expect(config.chat.enabled).toBe(true);
    expect(config.chat.host).toBe('127.0.0.1');
    expect(config.chat.port).toBe(3737);
    expect(config.dashboard.enabled).toBe(true);
    expect(config.dashboard.port).toBe(5173);
    expect(config.comms.enabled).toBe(false);
    expect(config.comms.port).toBe(3200);
  });

  it('accepts partial overrides for services and URLs', () => {
    const config = NetworkConfigSchema.parse({
      network: { mode: 'insecure' },
      chat: { port: 4242, model: 'gpt-5' },
      dashboard: { apiUrl: 'http://127.0.0.1:4242' },
      comms: {
        enabled: true,
        orchestratorWsUrl: 'ws://127.0.0.1:4242/v1/chat/ws',
        slack: { enabled: true },
      },
    });

    expect(config.network.mode).toBe('insecure');
    expect(config.chat.port).toBe(4242);
    expect(config.chat.model).toBe('gpt-5');
    expect(config.dashboard.apiUrl).toBe('http://127.0.0.1:4242');
    expect(config.comms.enabled).toBe(true);
    expect(config.comms.orchestratorWsUrl).toBe('ws://127.0.0.1:4242/v1/chat/ws');
    expect(config.comms.slack.enabled).toBe(true);
  });
});

describe('OrchestratorConfigSchema network integration', () => {
  it('fills network defaults into the canonical orchestrator config', () => {
    const config = OrchestratorConfigSchema.parse({
      chat: { port: 4242 },
    });

    expect(config.chat.port).toBe(4242);
    expect(config.chat.host).toBe('127.0.0.1');
    expect(config.dashboard.enabled).toBe(true);
    expect(config.network.mode).toBe('secure');
  });
});
