import { describe, expect, it } from 'vitest';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { createNetworkRegistry, filterNetworkServices, resolveNetworkServices } from '../../../src/network/network-registry.js';

describe('network-registry', () => {
  const context = { repoRoot: '/repo/frankenbeast' };

  it('selects default services from config', () => {
    const services = resolveNetworkServices(defaultConfig(), context);

    expect(services.map((service) => service.id)).toEqual(['beasts-daemon', 'chat-server', 'dashboard-web']);
  });

  it('orders dependencies before dependents', () => {
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.slack.enabled = true;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual([
      'beasts-daemon',
      'chat-server',
      'dashboard-web',
      'comms-gateway',
    ]);
  });

  it('skips disabled services cleanly', () => {
    const config = defaultConfig();
    config.dashboard.enabled = false;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual(['beasts-daemon', 'chat-server']);
  });

  it('does not force disabled daemon dependencies into chat-only selections', () => {
    const config = defaultConfig();
    config.beastsDaemon.enabled = false;
    config.dashboard.enabled = false;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual(['chat-server']);
  });

  it('filters a chat target without requiring disabled daemon dependencies', () => {
    const config = defaultConfig();
    config.beastsDaemon.enabled = false;
    config.dashboard.enabled = false;
    const services = resolveNetworkServices(config, context);

    expect(filterNetworkServices(services, 'chat-server').map((service) => service.id)).toEqual(['chat-server']);
  });

  it('projects runtime config for each service', () => {
    const config = defaultConfig();
    config.chat.port = 4242;
    config.dashboard.apiUrl = 'http://127.0.0.1:4242';

    const services = resolveNetworkServices(config, context);
    const daemon = services.find((service) => service.id === 'beasts-daemon');
    const chatServer = services.find((service) => service.id === 'chat-server');
    const dashboard = services.find((service) => service.id === 'dashboard-web');

    expect(daemon?.runtimeConfig).toMatchObject({
      host: '127.0.0.1',
      port: 4050,
      url: 'http://127.0.0.1:4050',
      healthUrl: 'http://127.0.0.1:4050/health',
    });
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
      process: {
        env: {
          VITE_API_URL: '',
          VITE_API_PROXY_TARGET: 'http://127.0.0.1:4242',
          VITE_BEAST_API_PROXY_TARGET: 'http://127.0.0.1:4050',
        },
      },
    });
  });

  it('provides explanation strings for help and status', () => {
    const registry = createNetworkRegistry();

    expect(registry.get('beasts-daemon')?.describe(defaultConfig())).toContain('beastsDaemon.enabled=true');
    expect(registry.get('chat-server')?.describe(defaultConfig())).toContain('chat.enabled=true');
    expect(registry.get('dashboard-web')?.describe(defaultConfig())).toContain('dashboard.enabled=true');
    expect(registry.get('comms-gateway')?.describe(defaultConfig())).toContain('comms.enabled');
  });
});
