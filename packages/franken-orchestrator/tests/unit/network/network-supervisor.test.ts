import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { NetworkLogStore } from '../../../src/network/network-logs.js';
import { createNetworkRegistry, resolveNetworkServices } from '../../../src/network/network-registry.js';
import { NetworkStateStore } from '../../../src/network/network-state-store.js';
import { NetworkSupervisor } from '../../../src/network/network-supervisor.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

describe('NetworkSupervisor', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('starts services in dependency order and stops them in reverse order', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const started: string[] = [];
    const stopped: string[] = [];
    const services = resolveNetworkServices(defaultConfig(), { repoRoot: '/repo/frankenbeast' });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(async (service) => {
        started.push(service.id);
        return { pid: started.length + 100 };
      }),
      stopService: vi.fn(async (serviceState) => {
        stopped.push(serviceState.id);
      }),
      healthcheck: vi.fn(async () => true),
      now: () => '2026-03-09T00:00:00.000Z',
    });

    const state = await supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    });
    await supervisor.stopAll(state);

    expect(started).toEqual(['beasts-daemon', 'chat-server', 'dashboard-web']);
    expect(stopped).toEqual(['dashboard-web', 'chat-server', 'beasts-daemon']);
  });

  it('writes detached operator state and registers log files', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const services = resolveNetworkServices(defaultConfig(), { repoRoot: '/repo/frankenbeast' });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(async (_service, options) => {
        expect(options.logFile).toMatch(/\.log$/);
        return { pid: 201 };
      }),
      stopService: vi.fn(async () => undefined),
      healthcheck: vi.fn(async () => true),
      now: () => '2026-03-09T00:00:00.000Z',
    });

    await supervisor.up({
      services,
      detached: true,
      mode: 'insecure',
      secureBackend: 'local-encrypted',
    });

    const persisted = await stateStore.load();
    expect(persisted?.detached).toBe(true);
    expect(persisted?.services.map((service) => service.logFile)).toEqual(expect.arrayContaining([
      expect.stringMatching(/beasts-daemon\.log$/),
      expect.stringMatching(/chat-server\.log$/),
      expect.stringMatching(/dashboard-web\.log$/),
    ]));
  });

  it('marks stored services stale when healthchecks fail', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const registry = createNetworkRegistry();

    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 301,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
          logFile: join(workDir, 'logs', 'chat-server.log'),
        },
      ],
    });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(),
      stopService: vi.fn(),
      healthcheck: vi.fn(async () => false),
      now: () => '2026-03-09T00:00:00.000Z',
    });

    const status = await supervisor.status(registry);

    expect(status.services).toEqual([
      expect.objectContaining({
        id: 'chat-server',
        status: 'stale',
      }),
    ]);
  });

  it('reuses a managed running service instead of spawning it again', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const services = resolveNetworkServices(defaultConfig(), { repoRoot: '/repo/frankenbeast' });
    const startService = vi.fn(async (service) => ({ pid: service.id === 'dashboard-web' ? 202 : 201 }));

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService,
      stopService: vi.fn(async () => undefined),
      healthcheck: vi.fn(async () => true),
      preflightService: vi.fn(async (service) => service.id === 'chat-server'
        ? { action: 'reuse' as const }
        : service.id === 'beasts-daemon'
          ? { action: 'reuse' as const }
          : { action: 'start' as const }),
      now: () => '2026-03-10T00:00:00.000Z',
    });

    const state = await supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    });

    expect(startService).toHaveBeenCalledTimes(1);
    expect(startService).toHaveBeenCalledWith(expect.objectContaining({ id: 'dashboard-web' }), expect.any(Object));
    expect(state.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'beasts-daemon',
        pid: 0,
        status: 'already-running',
      }),
      expect.objectContaining({
        id: 'chat-server',
        pid: 0,
        status: 'already-running',
      }),
      expect.objectContaining({
        id: 'dashboard-web',
        status: 'started',
      }),
    ]));
  });

  it('attaches in-process comms gateway after verifying its own health endpoint', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.slack.enabled = true;
    const services = resolveNetworkServices(config, { repoRoot: '/repo/frankenbeast' });
    const startService = vi.fn(async (service: { id: string }) => ({ pid: service.id === 'dashboard-web' ? 203 : 202 }));
    const healthcheck = vi.fn(async () => true);

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService,
      stopService: vi.fn(async () => undefined),
      healthcheck,
      preflightService: vi.fn(async () => ({ action: 'start' as const })),
      now: () => '2026-03-10T00:00:00.000Z',
    });

    const state = await supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    });
    await stateStore.save(state);
    const status = await supervisor.status();

    expect(startService).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'comms-gateway' }), expect.any(Object));
    expect(startService).toHaveBeenCalledTimes(3);
    expect(state.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'comms-gateway',
        pid: 0,
        inProcess: true,
        hostServiceId: 'chat-server',
        channels: {
          slack: true,
          discord: false,
        },
      }),
    ]));
    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'comms-gateway',
        status: 'running',
        inProcess: true,
        channels: {
          slack: true,
          discord: false,
        },
      }),
    ]));
    expect(healthcheck).toHaveBeenCalledWith(expect.objectContaining({ id: 'comms-gateway' }));
    expect(healthcheck).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }));
  });

  it('fails startup when an in-process comms gateway health endpoint is not mounted', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.slack.enabled = true;
    const services = resolveNetworkServices(config, { repoRoot: '/repo/frankenbeast' });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(async () => ({ pid: 202 })),
      stopService: vi.fn(async () => undefined),
      healthcheck: vi.fn(async (service) => service.id !== 'comms-gateway'),
      preflightService: vi.fn(async () => ({ action: 'start' as const })),
      now: () => '2026-03-10T00:00:00.000Z',
      startupAttempts: 1,
      startupDelayMs: 0,
    });

    await expect(supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    })).rejects.toThrow(/Service comms-gateway failed healthcheck during startup/);
  });

  it('marks in-process comms gateway stale when its host is unhealthy', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));

    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 301,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
        },
        {
          id: 'comms-gateway',
          pid: 0,
          dependsOn: ['chat-server'],
          startedAt: '2026-03-09T00:00:00.000Z',
          inProcess: true,
          hostServiceId: 'chat-server',
          channels: { slack: true, discord: false },
        },
      ],
    });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(),
      stopService: vi.fn(),
      healthcheck: vi.fn(async () => false),
      now: () => '2026-03-09T00:00:00.000Z',
    });

    const status = await supervisor.status();

    expect(status.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'chat-server', status: 'stale' }),
      expect.objectContaining({ id: 'comms-gateway', status: 'stale', inProcess: true }),
    ]));
  });

  it('rejects stopping the in-process comms gateway without changing persisted state', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const stopped: string[] = [];

    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 301,
          dependsOn: [],
          startedAt: '2026-03-09T00:00:00.000Z',
        },
        {
          id: 'dashboard-web',
          pid: 302,
          dependsOn: ['chat-server'],
          startedAt: '2026-03-09T00:00:00.000Z',
        },
        {
          id: 'comms-gateway',
          pid: 0,
          dependsOn: ['chat-server'],
          startedAt: '2026-03-09T00:00:00.000Z',
          inProcess: true,
          hostServiceId: 'chat-server',
        },
      ],
    });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(),
      stopService: vi.fn(async (service) => { stopped.push(service.id); }),
      healthcheck: vi.fn(async () => true),
      now: () => '2026-03-09T00:00:00.000Z',
    });

    await expect(supervisor.stop('comms-gateway')).rejects.toThrow(/Cannot stop in-process service comms-gateway independently/);

    expect(stopped).toEqual([]);
    await expect(stateStore.load()).resolves.toEqual(expect.objectContaining({
      services: expect.arrayContaining([
        expect.objectContaining({ id: 'chat-server' }),
        expect.objectContaining({ id: 'dashboard-web' }),
        expect.objectContaining({ id: 'comms-gateway' }),
      ]),
    }));
  });

  it('fails fast and rolls back started services when an unmanaged conflict owns a service port', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const services = resolveNetworkServices(defaultConfig(), { repoRoot: '/repo/frankenbeast' });
    const stopService = vi.fn(async () => undefined);

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(async () => ({ pid: 501 })),
      stopService,
      healthcheck: vi.fn(async () => true),
      preflightService: vi.fn(async (service) => service.id === 'dashboard-web'
        ? { action: 'conflict' as const, reason: 'Port conflict for dashboard-web on 127.0.0.1:5173' }
        : { action: 'start' as const }),
      now: () => '2026-03-10T00:00:00.000Z',
    });

    await expect(supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    })).rejects.toThrow(/Port conflict for dashboard-web/);

    expect(stopService).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }));
  });
});
