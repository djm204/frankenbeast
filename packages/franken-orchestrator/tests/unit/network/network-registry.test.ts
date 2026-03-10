import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { createNetworkRegistry, resolveNetworkServices } from '../../../src/network/network-registry.js';

describe('network-registry', () => {
  const context = { repoRoot: '/repo/frankenbeast' };

  it('selects default services from config', () => {
    const services = resolveNetworkServices(defaultConfig(), context);

    expect(services.map((service) => service.id)).toEqual(['chat-server', 'dashboard-web']);
  });

  it('orders dependencies before dependents', () => {
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.slack.enabled = true;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual([
      'chat-server',
      'dashboard-web',
      'comms-gateway',
    ]);
  });

  it('skips disabled services cleanly', () => {
    const config = defaultConfig();
    config.dashboard.enabled = false;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual(['chat-server']);
  });

  it('projects runtime config for each service', () => {
    const config = defaultConfig();
    config.chat.port = 4242;
    config.dashboard.apiUrl = 'http://127.0.0.1:4242';

    const services = resolveNetworkServices(config, context);
    const chatServer = services.find((service) => service.id === 'chat-server');
    const dashboard = services.find((service) => service.id === 'dashboard-web');

    expect(chatServer?.runtimeConfig).toMatchObject({
      host: '127.0.0.1',
      port: 4242,
      url: 'http://127.0.0.1:4242',
      wsUrl: 'ws://127.0.0.1:4242/v1/chat/ws',
      model: 'claude-sonnet-4-6',
    });
    expect(dashboard?.runtimeConfig).toMatchObject({
      host: '127.0.0.1',
      port: 5173,
      apiUrl: 'http://127.0.0.1:4242',
      url: 'http://127.0.0.1:5173',
    });
  });

  it('provides explanation strings for help and status', () => {
    const registry = createNetworkRegistry();

    expect(registry.get('chat-server')?.describe(defaultConfig())).toContain('chat.enabled=true');
    expect(registry.get('dashboard-web')?.describe(defaultConfig())).toContain('dashboard.enabled=true');
    expect(registry.get('comms-gateway')?.describe(defaultConfig())).toContain('comms.enabled');
  });
});
