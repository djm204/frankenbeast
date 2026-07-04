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
    expect(services.find((service) => service.id === 'comms-gateway')?.runtimeConfig).toMatchObject({
      inProcess: true,
      channels: {
        slack: true,
        discord: false,
      },
    });
  });

  it('starts comms gateway when Telegram or WhatsApp channels are enabled', () => {
    const telegramConfig = defaultConfig();
    telegramConfig.comms.telegram.enabled = true;
    const telegramServices = resolveNetworkServices(telegramConfig, context);
    const telegramGateway = telegramServices.find((service) => service.id === 'comms-gateway');

    expect(telegramServices.map((service) => service.id)).toContain('comms-gateway');
    expect(telegramGateway?.runtimeConfig).toMatchObject({
      host: '127.0.0.1',
      port: 3737,
      url: 'http://127.0.0.1:3737',
      healthUrl: 'http://127.0.0.1:3737/comms/health',
      channels: {
        telegram: true,
        whatsapp: false,
      },
    });

    const whatsappConfig = defaultConfig();
    whatsappConfig.comms.whatsapp.enabled = true;
    const whatsappGateway = resolveNetworkServices(whatsappConfig, context)
      .find((service) => service.id === 'comms-gateway');

    expect(whatsappGateway?.runtimeConfig).toMatchObject({
      channels: {
        telegram: false,
        whatsapp: true,
      },
    });
  });

  it('skips disabled services cleanly', () => {
    const config = defaultConfig();
    config.dashboard.enabled = false;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual(['beasts-daemon', 'chat-server']);
  });

  it('includes disabled hard dependencies required by enabled services', () => {
    const config = defaultConfig();
    config.beastsDaemon.enabled = false;
    config.dashboard.enabled = false;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual(['beasts-daemon', 'chat-server']);
  });

  it('filters a chat target with its hard daemon dependency', () => {
    const config = defaultConfig();
    config.beastsDaemon.enabled = false;
    config.dashboard.enabled = false;
    const services = resolveNetworkServices(config, context);

    expect(filterNetworkServices(services, 'chat-server').map((service) => service.id)).toEqual(['beasts-daemon', 'chat-server']);
  });

  it('includes chat hard dependency when dashboard is enabled directly', () => {
    const config = defaultConfig();
    config.chat.enabled = false;
    config.dashboard.enabled = true;

    const services = resolveNetworkServices(config, context);

    expect(services.map((service) => service.id)).toEqual(['beasts-daemon', 'chat-server', 'dashboard-web']);
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

  it('forwards an explicit config path to spawned chat servers', () => {
    const services = resolveNetworkServices(defaultConfig(), {
      repoRoot: '/repo/frankenbeast',
      configFile: '/tmp/custom-frankenbeast.json',
    });
    const chatServer = services.find((service) => service.id === 'chat-server');

    expect(chatServer?.runtimeConfig.process?.args).toEqual(expect.arrayContaining([
      '--config',
      '/tmp/custom-frankenbeast.json',
    ]));
  });

  it('provides explanation strings for help and status', () => {
    const registry = createNetworkRegistry();

    expect(registry.get('beasts-daemon')?.describe(defaultConfig())).toContain('beastsDaemon.enabled=true');
    expect(registry.get('chat-server')?.describe(defaultConfig())).toContain('chat.enabled=true');
    expect(registry.get('dashboard-web')?.describe(defaultConfig())).toContain('dashboard.enabled=true');
    expect(registry.get('comms-gateway')?.describe(defaultConfig())).toContain('comms.enabled');
  });
});
