import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runNetworkCommand } from '../../../src/cli/run.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { NetworkLogStore } from '../../../src/network/network-logs.js';
import { resolveNetworkServices } from '../../../src/network/network-registry.js';
import { NetworkStateStore } from '../../../src/network/network-state-store.js';
import { NetworkSupervisor } from '../../../src/network/network-supervisor.js';

describe('network CLI integration', () => {
  let workDir: string | undefined;

  afterEach(async () => {
    if (workDir) {
      await rm(workDir, { recursive: true, force: true });
    }
  });

  it('up status logs and down work together in detached mode', async () => {
    workDir = await mkdtemp(join(tmpdir(), 'franken-network-cli-'));
    const frankenbeastDir = join(workDir, '.frankenbeast');
    const stateStore = new NetworkStateStore(join(frankenbeastDir, 'network', 'state.json'));
    const logStore = new NetworkLogStore(join(frankenbeastDir, 'network', 'logs'));
    const services = resolveNetworkServices(defaultConfig(), { repoRoot: workDir });
    const outputs: string[] = [];
    const stopped: string[] = [];

    const createSupervisor = () =>
      new NetworkSupervisor({
        stateStore,
        logStore,
        startService: vi.fn(async (_service, options) => {
          expect(options.logFile).toMatch(/\.log$/);
          return { pid: 500 };
        }),
        stopService: vi.fn(async (serviceState) => {
          stopped.push(serviceState.id);
        }),
        healthcheck: vi.fn(async () => true),
        now: () => '2026-03-09T00:00:00.000Z',
      });

    await runNetworkCommand(
      {
        subcommand: 'network',
        networkAction: 'up',
        networkTarget: undefined,
        networkDetached: true,
        networkSet: undefined,
        baseDir: workDir,
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
      },
      defaultConfig(),
      workDir,
      { frankenbeastDir },
      {
        resolveServices: vi.fn(() => services),
        createSupervisor,
        print: (line: string) => outputs.push(line),
        printError: (line: string) => outputs.push(line),
        renderHelp: () => 'help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    await runNetworkCommand(
      {
        subcommand: 'network',
        networkAction: 'status',
        networkTarget: undefined,
        networkDetached: false,
        networkSet: undefined,
        baseDir: workDir,
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
      },
      defaultConfig(),
      workDir,
      { frankenbeastDir },
      {
        resolveServices: vi.fn(() => services),
        createSupervisor,
        print: (line: string) => outputs.push(line),
        printError: (line: string) => outputs.push(line),
        renderHelp: () => 'help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    await runNetworkCommand(
      {
        subcommand: 'network',
        networkAction: 'logs',
        networkTarget: 'all',
        networkDetached: false,
        networkSet: undefined,
        baseDir: workDir,
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
      },
      defaultConfig(),
      workDir,
      { frankenbeastDir },
      {
        resolveServices: vi.fn(() => services),
        createSupervisor,
        print: (line: string) => outputs.push(line),
        printError: (line: string) => outputs.push(line),
        renderHelp: () => 'help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    await runNetworkCommand(
      {
        subcommand: 'network',
        networkAction: 'down',
        networkTarget: undefined,
        networkDetached: false,
        networkSet: undefined,
        baseDir: workDir,
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
      },
      defaultConfig(),
      workDir,
      { frankenbeastDir },
      {
        resolveServices: vi.fn(() => services),
        createSupervisor,
        print: (line: string) => outputs.push(line),
        printError: (line: string) => outputs.push(line),
        renderHelp: () => 'help',
        waitForShutdown: vi.fn(async () => undefined),
      },
    );

    expect(outputs.join('\n')).toContain('Started 2 services');
    expect(outputs.join('\n')).toContain('Mode: secure');
    expect(outputs.join('\n')).toContain('chat-server.log');
    expect(stopped).toEqual(['dashboard-web', 'chat-server']);
    await expect(stateStore.load()).resolves.toBeUndefined();
  });
});
