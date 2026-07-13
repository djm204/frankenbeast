import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve as resolvePath } from 'node:path';
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

function makePaths(root = '/repo/frankenbeast'): { frankenbeastDir: string; configFile: string } {
  const frankenbeastDir = join(root, '.fbeast');
  return {
    frankenbeastDir,
    configFile: join(frankenbeastDir, 'config.json'),
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
      services: [
        { id: 'chat-server', pid: 101, dependsOn: [], startedAt: '2026-03-09T00:00:00.000Z', url: 'http://127.0.0.1:3737', status: 'started' },
        { id: 'dashboard-web', pid: 102, dependsOn: ['chat-server'], startedAt: '2026-03-09T00:00:00.000Z', url: 'http://127.0.0.1:5173', status: 'started' },
      ],
    }));
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'up', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => services),
        createSupervisor: vi.fn(() => ({
          up,
          stopAll: vi.fn(),
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
    expect(print).toHaveBeenCalledWith('chat-server: http://127.0.0.1:3737');
  });

  it('up reports reused services distinctly', async () => {
    const services = [makeService('chat-server')];
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'up', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => services),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(async () => ({
            mode: 'secure' as const,
            secureBackend: 'local-encrypted',
            detached: true,
            startedAt: '2026-03-10T00:00:00.000Z',
            services: [
              { id: 'chat-server', pid: 0, dependsOn: [], startedAt: '2026-03-10T00:00:00.000Z', url: 'http://127.0.0.1:3737', status: 'already-running' },
            ],
          })),
          stopAll: vi.fn(),
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

    expect(print).toHaveBeenCalledWith('Already running 1 service.');
  });

  it('resolves relative config paths before forwarding them to managed services', async () => {
    const config = defaultConfig();
    const resolveServices = vi.fn(() => [makeService('chat-server')]);

    await runNetworkCommand(
      makeArgs({ networkAction: 'up', networkDetached: true, config: 'configs/runtime.json' }),
      config,
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices,
        createSupervisor: vi.fn(() => ({
          up: vi.fn(async () => ({ services: [] })),
          stopAll: vi.fn(),
          down: vi.fn(),
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

    expect(resolveServices).toHaveBeenCalledWith(config, {
      repoRoot: '/repo/frankenbeast',
      configFile: resolvePath('configs/runtime.json'),
    });
  });

  it('forwards network --set overrides to managed services', async () => {
    const config = defaultConfig();
    const resolveServices = vi.fn(() => [makeService('chat-server')]);

    await runNetworkCommand(
      makeArgs({
        networkAction: 'up',
        networkDetached: true,
        networkSet: ['comms.telegram.enabled=true'],
      }),
      config,
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices,
        createSupervisor: vi.fn(() => ({
          up: vi.fn(async () => ({ services: [] })),
          stopAll: vi.fn(),
          down: vi.fn(),
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

    expect(resolveServices).toHaveBeenCalledWith(config, {
      repoRoot: '/repo/frankenbeast',
      configOverrides: ['comms.telegram.enabled=true'],
    });
  });

  it('foreground shutdown stops only services started by this invocation', async () => {
    const stopAll = vi.fn(async () => undefined);
    const waitForShutdown = vi.fn(async () => undefined);

    await runNetworkCommand(
      makeArgs({ networkAction: 'up', networkDetached: false }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => [makeService('chat-server'), makeService('dashboard-web')]),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(async () => ({
            services: [
              { id: 'chat-server', pid: 0, dependsOn: [], startedAt: '2026-03-10T00:00:00.000Z', status: 'already-running' as const },
              { id: 'dashboard-web', pid: 102, dependsOn: ['chat-server'], startedAt: '2026-03-10T00:00:00.000Z', status: 'started' as const },
            ],
          })),
          stopAll,
          down: vi.fn(),
          status: vi.fn(),
          stop: vi.fn(),
          logs: vi.fn(),
        })),
        print: vi.fn(),
        printError: vi.fn(),
        renderHelp: () => 'network help',
        waitForShutdown,
      },
    );

    expect(waitForShutdown).toHaveBeenCalled();
    expect(stopAll).toHaveBeenCalledWith(expect.objectContaining({
      services: [expect.objectContaining({ id: 'dashboard-web', status: 'started' })],
    }));
  });

  it('up does not print started when the supervisor rejects startup', async () => {
    const print = vi.fn();

    await expect(runNetworkCommand(
      makeArgs({ networkAction: 'up', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => [makeService('chat-server')]),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(async () => {
            throw new Error('Port conflict for chat-server on 127.0.0.1:3737');
          }),
          stopAll: vi.fn(),
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
    )).rejects.toThrow(/Port conflict/);

    expect(print).not.toHaveBeenCalledWith(expect.stringContaining('Started'));
  });

  it('down tears down detached services', async () => {
    const down = vi.fn(async () => undefined);

    await runNetworkCommand(
      makeArgs({ networkAction: 'down' }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          stopAll: vi.fn(),
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
      makePaths(),
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          stopAll: vi.fn(),
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

  it('prints a scoped credential inventory without secret values', async () => {
    const config = defaultConfig();
    config.network.operatorTokenRef = ' prod/operator-token ';
    config.comms.enabled = true;
    config.comms.orchestratorTokenRef = 'prod/orchestrator-token';
    config.comms.slack.enabled = true;
    config.comms.slack.botTokenRef = '   ';
    config.comms.discord.enabled = true;
    config.comms.discord.botTokenRef = 'prod/discord-bot-token';
    config.comms.discord.publicKeyRef = undefined;
    config.comms.telegram.enabled = false;
    config.comms.telegram.botTokenRef = 'prod/telegram-bot-token';
    config.comms.whatsapp.enabled = true;
    config.comms.whatsapp.accessTokenRef = 'prod/whatsapp-access-token';
    config.comms.whatsapp.phoneNumberIdRef = undefined;
    config.comms.whatsapp.appSecretRef = 'prod/whatsapp-app-secret';
    config.comms.whatsapp.verifyTokenRef = 'prod/whatsapp-verify-token';
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'credentials' }),
      config,
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          stopAll: vi.fn(),
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

    const report = JSON.parse(print.mock.calls.at(-1)?.[0] as string) as {
      mode: string;
      secureBackend: string;
      credentials: Array<{ scope: string; configPath: string; ref: string | null; status: string }>;
    };

    expect(report.mode).toBe('secure');
    expect(report.secureBackend).toBe('local-encrypted');
    expect(report.credentials).toContainEqual({
      scope: 'network.operator',
      configPath: 'network.operatorTokenRef',
      ref: ' prod/operator-token ',
      status: 'invalid-whitespace',
    });
    expect(report.credentials).toContainEqual({
      scope: 'comms.orchestrator',
      configPath: 'comms.orchestratorTokenRef',
      ref: 'prod/orchestrator-token',
      status: 'optional-configured',
    });
    expect(report.credentials).toContainEqual({
      scope: 'comms.slack.bot',
      configPath: 'comms.slack.botTokenRef',
      ref: null,
      status: 'missing',
    });
    expect(report.credentials).toContainEqual({
      scope: 'comms.discord',
      configPath: 'comms.discord.botTokenRef',
      ref: 'prod/discord-bot-token',
      status: 'configured',
    });
    expect(report.credentials).toContainEqual({
      scope: 'comms.telegram',
      configPath: 'comms.telegram.botTokenRef',
      ref: 'prod/telegram-bot-token',
      status: 'inactive-configured',
    });
    expect(report.credentials).toContainEqual({
      scope: 'comms.discord.public',
      configPath: 'comms.discord.publicKeyRef',
      ref: null,
      status: 'missing',
    });
    expect(report.credentials).toContainEqual({
      scope: 'comms.whatsapp.phone-number',
      configPath: 'comms.whatsapp.phoneNumberIdRef',
      ref: null,
      status: 'missing',
    });
    expect(JSON.stringify(report)).not.toContain('super-secret-value');
    expect(JSON.stringify(report)).not.toContain('Bearer');
  });

  it('marks the operator token inactive when no managed service is selected', async () => {
    const config = defaultConfig();
    config.beastsDaemon.enabled = false;
    config.chat.enabled = false;
    config.dashboard.enabled = false;
    config.comms.enabled = false;

    const print = vi.fn();
    await runNetworkCommand(
      makeArgs({ networkAction: 'credentials' }),
      config,
      '/repo/frankenbeast',
      makePaths(),
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(),
        print,
        printError: vi.fn(),
        renderHelp: () => 'network help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    const report = JSON.parse(print.mock.calls.at(-1)?.[0] as string) as {
      credentials: Array<{ scope: string; configPath: string; ref: string | null; status: string }>;
    };
    expect(report.credentials).toContainEqual({
      scope: 'network.operator',
      configPath: 'network.operatorTokenRef',
      ref: null,
      status: 'inactive-missing',
    });
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
        stopAll: vi.fn(),
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
      makePaths(),
      deps,
    );
    await runNetworkCommand(
      makeArgs({ networkAction: 'stop', networkTarget: 'dashboard-web' }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
      deps,
    );
    await runNetworkCommand(
      makeArgs({ networkAction: 'restart', networkTarget: 'all', networkDetached: true }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
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
      makePaths(),
      {
        resolveServices: vi.fn(() => []),
        createSupervisor: vi.fn(() => ({
          up: vi.fn(),
          stopAll: vi.fn(),
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

  it('persists config --set changes to the operator config file', async () => {
    const root = await mkdtemp(join(tmpdir(), 'frankenbeast-network-config-'));
    const configFile = join(root, 'custom-config.json');
    try {
      await writeFile(configFile, JSON.stringify({
        chat: { model: 'old-model' },
        dashboard: { port: 5173 },
      }, null, 2) + '\n', 'utf-8');

      const config = defaultConfig();
      config.chat.model = 'new-model';
      config.dashboard.port = 6000;
      const print = vi.fn();

      await runNetworkCommand(
        makeArgs({
          networkAction: 'config',
          networkSet: ['chat.model=new-model', 'dashboard.port=6000'],
          config: configFile,
        }),
        config,
        root,
        makePaths(root),
        {
          resolveServices: vi.fn(() => []),
          createSupervisor: vi.fn(() => ({
            up: vi.fn(),
            stopAll: vi.fn(),
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

      const saved = JSON.parse(await readFile(configFile, 'utf-8')) as {
        chat: { model: string };
        dashboard: { port: number };
      };
      expect(saved.chat.model).toBe('new-model');
      expect(saved.dashboard.port).toBe(6000);
      expect(print).toHaveBeenCalledWith(`Saved network config to ${configFile}.`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('persists config --set changes to the default operator config file when --config is omitted', async () => {
    const root = await mkdtemp(join(tmpdir(), 'frankenbeast-network-default-config-'));
    const paths = makePaths(root);
    try {
      const config = defaultConfig();
      config.dashboard.port = 6000;
      const print = vi.fn();

      await runNetworkCommand(
        makeArgs({
          networkAction: 'config',
          networkSet: ['dashboard.port=6000'],
        }),
        config,
        root,
        paths,
        {
          resolveServices: vi.fn(() => []),
          createSupervisor: vi.fn(() => ({
            up: vi.fn(),
            stopAll: vi.fn(),
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

      const saved = JSON.parse(await readFile(paths.configFile, 'utf-8')) as {
        dashboard: { port: number };
      };
      expect(saved.dashboard.port).toBe(6000);
      expect(print).toHaveBeenCalledWith(`Saved network config to ${paths.configFile}.`);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('help prints a man-style command reference', async () => {
    const print = vi.fn();

    await runNetworkCommand(
      makeArgs({ networkAction: 'help' }),
      defaultConfig(),
      '/repo/frankenbeast',
      makePaths(),
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
