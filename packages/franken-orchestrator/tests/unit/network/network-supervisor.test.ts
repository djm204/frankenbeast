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

    expect(started).toEqual(['chat-server', 'dashboard-web']);
    expect(stopped).toEqual(['dashboard-web', 'chat-server']);
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
    expect(persisted?.services[0]?.logFile).toMatch(/chat-server\.log$/);
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
