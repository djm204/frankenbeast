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

  it('records in-process services without spawning a child process', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const config = defaultConfig();
    config.comms.telegram.enabled = true;
    const services = resolveNetworkServices(config, { repoRoot: '/repo/frankenbeast' });
    const startService = vi.fn(async (service) => ({ pid: service.id === 'dashboard-web' ? 202 : 201 }));
    const preflightService = vi.fn(async (service) => service.id === 'comms-gateway'
      ? { action: 'conflict' as const, reason: 'Port conflict for comms-gateway on 127.0.0.1:3200' }
      : { action: 'start' as const });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService,
      stopService: vi.fn(async () => undefined),
      healthcheck: vi.fn(async () => true),
      preflightService,
      now: () => '2026-03-10T00:00:00.000Z',
    });

    const state = await supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    });

    expect(startService).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'comms-gateway' }), expect.any(Object));
    expect(preflightService).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'comms-gateway' }));
    expect(state.services).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'comms-gateway',
        pid: 0,
        status: 'already-running',
        inProcess: true,
      }),
    ]));
  });

  it('probes in-process comms health before reporting it ready', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const config = defaultConfig();
    config.comms.telegram.enabled = true;
    const services = resolveNetworkServices(config, { repoRoot: '/repo/frankenbeast' });
    const stopService = vi.fn(async () => undefined);

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(async () => ({ pid: 501 })),
      stopService,
      healthcheck: vi.fn(async (service) => service.id !== 'comms-gateway'),
      now: () => '2026-03-10T00:00:00.000Z',
      startupAttempts: 1,
    });

    await expect(supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    })).rejects.toThrow(/Service comms-gateway failed healthcheck/);

    expect(stopService).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }));
  });

  it('restarts a reused chat-server when in-process comms routes are missing', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const config = defaultConfig();
    config.comms.telegram.enabled = true;
    const services = resolveNetworkServices(config, { repoRoot: '/repo/frankenbeast' });
    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: false,
      startedAt: '2026-03-10T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 500,
          detached: false,
          dependsOn: ['beasts-daemon'],
          startedAt: '2026-03-10T00:00:00.000Z',
          status: 'started',
        },
      ],
    });
    const startService = vi.fn(async () => ({ pid: 601 }));
    const stopService = vi.fn(async () => undefined);
    const healthcheck = vi.fn(async (service) => {
      if (service.id === 'comms-gateway') {
        return startService.mock.calls.some(([startedService]) => startedService.id === 'chat-server');
      }
      return true;
    });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService,
      stopService,
      healthcheck,
      preflightService: vi.fn(async (service) => service.id === 'chat-server'
        ? { action: 'reuse' as const }
        : { action: 'start' as const }),
      now: () => '2026-03-10T00:00:00.000Z',
      startupAttempts: 1,
    });

    const state = await supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    });

    expect(stopService).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }));
    expect(startService).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }), expect.any(Object));
    expect(state.services).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'chat-server', pid: 601, status: 'started' }),
      expect.objectContaining({ id: 'comms-gateway', inProcess: true }),
    ]));
  });

  it('reports reused pid-zero chat-server hosts instead of spawning a duplicate for in-process comms', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const config = defaultConfig();
    config.comms.telegram.enabled = true;
    const services = resolveNetworkServices(config, { repoRoot: '/repo/frankenbeast' });
    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: false,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 0,
          detached: false,
          dependsOn: ['beasts-daemon'],
          startedAt: '2026-03-09T00:00:00.000Z',
          status: 'already-running',
        },
      ],
    });
    const startService = vi.fn(async () => ({ pid: 601 }));
    const stopService = vi.fn(async () => undefined);

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService,
      stopService,
      healthcheck: vi.fn(async (service) => service.id !== 'comms-gateway'),
      preflightService: vi.fn(async (service) => service.id === 'chat-server'
        ? { action: 'reuse' as const }
        : { action: 'start' as const }),
      now: () => '2026-03-10T00:00:00.000Z',
      startupAttempts: 1,
    });

    await expect(supervisor.up({
      services,
      detached: false,
      mode: 'secure',
      secureBackend: 'local-encrypted',
    })).rejects.toThrow(/host service chat-server is already running outside this network state/);

    expect(stopService).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }));
    expect(startService).not.toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }), expect.any(Object));
  });


  it('allows reused pid-zero services to stop because they are not in-process markers', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const stopService = vi.fn(async () => undefined);
    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-10T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 0,
          detached: true,
          dependsOn: ['beasts-daemon'],
          startedAt: '2026-03-10T00:00:00.000Z',
          status: 'already-running',
        },
      ],
    });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(),
      stopService,
      healthcheck: vi.fn(async () => true),
    });

    await supervisor.stop('chat-server');
    expect(stopService).toHaveBeenCalledWith(expect.objectContaining({ id: 'chat-server' }));
  });

  it('rejects stopping an in-process service as an independent process', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-supervisor-'));
    const stateStore = new NetworkStateStore(join(workDir, 'network-state.json'));
    const logStore = new NetworkLogStore(join(workDir, 'logs'));
    const stopService = vi.fn(async () => undefined);
    await stateStore.save({
      mode: 'secure',
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-10T00:00:00.000Z',
      services: [
        {
          id: 'chat-server',
          pid: 501,
          detached: true,
          dependsOn: ['beasts-daemon'],
          startedAt: '2026-03-10T00:00:00.000Z',
          status: 'started',
        },
        {
          id: 'comms-gateway',
          pid: 0,
          detached: true,
          dependsOn: ['chat-server'],
          startedAt: '2026-03-10T00:00:00.000Z',
          status: 'already-running',
          inProcess: true,
        },
      ],
    });

    const supervisor = new NetworkSupervisor({
      stateStore,
      logStore,
      startService: vi.fn(),
      stopService,
      healthcheck: vi.fn(async () => true),
    });

    await expect(supervisor.stop('comms-gateway')).rejects.toThrow(/hosted in-process by chat-server/);
    expect(stopService).not.toHaveBeenCalled();
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
