import { describe, expect, it, vi } from 'vitest';
import type { CliArgs } from '../../../src/cli/args.js';
import { runNetworkCommand } from '../../../src/cli/run.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import type { NetworkSupervisorStatus } from '../../../src/network/network-supervisor.js';
import type { ResolvedNetworkService } from '../../../src/network/network-registry.js';

function makeArgs(overrides: Partial<CliArgs> = {}): CliArgs {
  return {
    subcommand: 'network',
    networkAction: 'status',
    networkTarget: undefined,
    networkDetached: false,
    networkSet: undefined,
    baseDir: '/repo/frankenbeast',
    baseBranch: undefined,
    budget: 10,
    provider: 'claude',
    providers: undefined,
    designDoc: undefined,
    planDir: undefined,
    planName: undefined,
    noPr: false,
    verbose: false,
    reset: false,
    resume: false,
    cleanup: false,
    config: undefined,
    host: undefined,
    port: undefined,
    allowOrigin: undefined,
    help: false,
    issueLabel: undefined,
    issueMilestone: undefined,
    issueSearch: undefined,
    issueAssignee: undefined,
    issueLimit: undefined,
    issueRepo: undefined,
    dryRun: undefined,
    ...overrides,
  };
}

function makeService(id: ResolvedNetworkService['id']): ResolvedNetworkService {
  return {
    id,
    displayName: id,
    kind: 'app',
    dependsOn: id === 'dashboard-web' ? ['chat-server'] : [],
    configPaths: [],
    explanation: `${id} explanation`,
    enabled: () => true,
    describe: () => `${id} explanation`,
    buildRuntimeConfig: () => ({}),
    runtimeConfig: {},
  };
}

describe('runNetworkCommand', () => {
  it('up starts enabled services', async () => {
    const services = [makeService('chat-server'), makeService('dashboard-web')];
    const up = vi.fn(async () => ({
      mode: 'secure' as const,
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [],
    }));
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'up', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      {
        frankenbeastDir: '/repo/frankenbeast/.frankenbeast',
      },
      {
        resolveServices: vi.fn(() => services),
        createSupervisor: vi.fn(() => ({
          up,
          down: vi.fn(),
          status: vi.fn(),
          stop: vi.fn(),
          logs: vi.fn(),
        })),
        print,
        printError: vi.fn(),
        renderHelp: () => 'network help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(up).toHaveBeenCalledWith(expect.objectContaining({
      services,
      detached: true,
    }));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Started 2 service'));
  });

  it('down tears down detached services', async () => {
    const down = vi.fn(async () => undefined);

    await runNetworkCommand(
      makeArgs({ networkAction: 'down' }),
      defaultConfig(),
      '/repo/frankenbeast',
      {
        frankenbeastDir: '/repo/frankenbeast/.frankenbeast',
      },
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          down,
          status: vi.fn(),
          stop: vi.fn(),
          logs: vi.fn(),
        })),
        print: vi.fn(),
        printError: vi.fn(),
        renderHelp: () => 'network help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(down).toHaveBeenCalled();
  });

  it('status reports service and mode state', async () => {
    const status: NetworkSupervisorStatus = {
      mode: 'secure',
      secureBackend: 'local-encrypted',
      services: [{ id: 'chat-server', status: 'running' }],
    };
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'status' }),
      defaultConfig(),
      '/repo/frankenbeast',
      {
        frankenbeastDir: '/repo/frankenbeast/.frankenbeast',
      },
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          down: vi.fn(),
          status: vi.fn(async () => status),
          stop: vi.fn(),
          logs: vi.fn(),
        })),
        print,
        printError: vi.fn(),
        renderHelp: () => 'network help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(print).toHaveBeenCalledWith(expect.stringContaining('Mode: secure'));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('chat-server: running'));
  });

  it('start stop and restart target one service or all', async () => {
    const services = [makeService('chat-server'), makeService('dashboard-web')];
    const up = vi.fn(async () => ({
      mode: 'secure' as const,
      secureBackend: 'local-encrypted',
      detached: true,
      startedAt: '2026-03-09T00:00:00.000Z',
      services: [],
    }));
    const stop = vi.fn(async () => undefined);

    const deps = {
      resolveServices: vi.fn(() => services),
      createSupervisor: vi.fn(() => ({
        up,
        down: vi.fn(),
        status: vi.fn(),
        stop,
        logs: vi.fn(),
      })),
      print: vi.fn(),
      printError: vi.fn(),
      renderHelp: () => 'network help',
      waitForShutdown: vi.fn(async () => undefined),
    };

    await runNetworkCommand(
      makeArgs({ networkAction: 'start', networkTarget: 'dashboard-web', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      { frankenbeastDir: '/repo/frankenbeast/.frankenbeast' },
      deps,
    );
    await runNetworkCommand(
      makeArgs({ networkAction: 'stop', networkTarget: 'dashboard-web' }),
      defaultConfig(),
      '/repo/frankenbeast',
      { frankenbeastDir: '/repo/frankenbeast/.frankenbeast' },
      deps,
    );
    await runNetworkCommand(
      makeArgs({ networkAction: 'restart', networkTarget: 'all', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      { frankenbeastDir: '/repo/frankenbeast/.frankenbeast' },
      deps,
    );

    expect(up).toHaveBeenCalledTimes(2);
    expect(stop).toHaveBeenCalledWith('dashboard-web');
    expect(stop).toHaveBeenCalledWith('all');
  });

  it('logs resolves the correct log source', async () => {
    const logs = vi.fn(async () => ['/tmp/chat-server.log']);
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'logs', networkTarget: 'chat-server' }),
      defaultConfig(),
      '/repo/frankenbeast',
      {
        frankenbeastDir: '/repo/frankenbeast/.frankenbeast',
      },
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          down: vi.fn(),
          status: vi.fn(),
          stop: vi.fn(),
          logs,
        })),
        print,
        printError: vi.fn(),
        renderHelp: () => 'network help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(logs).toHaveBeenCalledWith('chat-server');
    expect(print).toHaveBeenCalledWith(expect.stringContaining('/tmp/chat-server.log'));
  });

  it('help prints a man-style command reference', async () => {
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'help' }),
      defaultConfig(),
      '/repo/frankenbeast',
      {
        frankenbeastDir: '/repo/frankenbeast/.frankenbeast',
      },
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(),
        print,
        printError: vi.fn(),
        renderHelp: () => 'NAME\n  frankenbeast network',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(print).toHaveBeenCalledWith(expect.stringContaining('frankenbeast network'));
  });
});
