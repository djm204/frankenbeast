import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleInitCommand } from '../../../src/cli/init-command.js';
import type { ProjectPaths } from '../../../src/cli/project-root.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

describe('handleInitCommand', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  function makeArgs(overrides: Record<string, unknown> = {}) {
    return {
      subcommand: 'init',
      networkAction: undefined,
      networkTarget: undefined,
      networkDetached: false,
      networkSet: undefined,
      baseDir: tempDir,
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
      initVerify: false,
      initRepair: false,
      initNonInteractive: false,
      ...overrides,
    } as any;
  }

  function makePaths(root: string, configFile: string): ProjectPaths {
    const frankenbeastDir = join(root, '.fbeast');
    return {
      root,
      frankenbeastDir,
      llmCacheDir: join(frankenbeastDir, '.cache', 'llm'),
      plansDir: join(frankenbeastDir, 'plans'),
      buildDir: join(frankenbeastDir, '.build'),
      beastsDir: join(frankenbeastDir, '.build', 'beasts'),
      beastLogsDir: join(frankenbeastDir, '.build', 'beasts', 'logs'),
      beastsDb: join(frankenbeastDir, 'beast.db'),
      chunkSessionsDir: join(frankenbeastDir, '.build', 'chunk-sessions'),
      chunkSessionSnapshotsDir: join(frankenbeastDir, '.build', 'chunk-session-snapshots'),
      checkpointFile: join(frankenbeastDir, '.build', '.checkpoint'),
      tracesDb: join(frankenbeastDir, '.build', 'build-traces.db'),
      logFile: join(frankenbeastDir, '.build', 'build.log'),
      designDocFile: join(frankenbeastDir, 'plans', 'design.md'),
      configFile,
      activePlanFile: join(frankenbeastDir, 'active-plan'),
      stateDir: join(frankenbeastDir, 'state'),
      llmResponseFile: join(frankenbeastDir, 'plans', 'llm-response.json'),
    };
  }

  it('writes canonical config and init state using the project paths', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.fbeast');
    const configFile = join(frankenbeastDir, 'config.json');
    const initStateFile = join(frankenbeastDir, 'init-state.json');

    await handleInitCommand({
      args: {
        subcommand: 'init',
        networkAction: undefined,
        networkTarget: undefined,
        networkDetached: false,
        networkSet: undefined,
        baseDir: tempDir,
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
        initVerify: false,
        initRepair: false,
        initNonInteractive: false,
      },
      config: defaultConfig(),
      io: {
        ask: async (prompt: string) => {
          switch (prompt) {
            case 'Enter passphrase for local encrypted store:':
              return 'test-passphrase';
            case 'Enable Chat? [Y/n]':
              return 'y';
            case 'Enable Dashboard? [Y/n]':
              return 'n';
            case 'Enable Comms? [y/N]':
              return 'n';
            case 'Default provider [claude]':
              return '';
            case 'Security mode [secure/insecure] (default: secure)':
              return '';
            case 'Enter operator token (leave blank to auto-generate):':
              return '';
            default:
              return '';
          }
        },
        display: () => undefined,
      },
      paths: makePaths(tempDir, configFile),
      print: () => undefined,
    });

    const config = JSON.parse(await readFile(configFile, 'utf-8')) as { chat: { enabled: boolean }; dashboard: { enabled: boolean } };
    const initState = JSON.parse(await readFile(initStateFile, 'utf-8')) as { selectedModules: string[] };

    expect(config.chat.enabled).toBe(true);
    expect(config.dashboard.enabled).toBe(false);
    expect(initState.selectedModules).toEqual(['chat']);
  });

  it('uses resolved fallback config for interactive init when existing config is not an object', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.fbeast');
    const configFile = join(frankenbeastDir, 'config.json');
    await mkdir(frankenbeastDir, { recursive: true });
    await writeFile(configFile, 'null\n', 'utf-8');
    const resolvedConfig = defaultConfig();
    resolvedConfig.chat.enabled = false;
    const ask = vi.fn(async (prompt: string) => {
      switch (prompt) {
        case 'Enter passphrase for local encrypted store:':
          return 'test-passphrase';
        case 'Enable Chat? [y/N]':
          return '';
        case 'Enable Dashboard? [Y/n]':
          return 'n';
        case 'Enable Comms? [y/N]':
          return 'n';
        case 'Default provider [claude]':
          return '';
        case 'Security mode [secure/insecure] (default: secure)':
          return '';
        case 'Enter operator token (leave blank to auto-generate):':
          return '';
        default:
          return '';
      }
    });

    await handleInitCommand({
      args: makeArgs(),
      config: resolvedConfig,
      configLoadFallback: true,
      io: { ask, display: () => undefined },
      paths: makePaths(tempDir, configFile),
      print: () => undefined,
    });

    const config = JSON.parse(await readFile(configFile, 'utf-8')) as { chat: { enabled: boolean } };
    expect(config.chat.enabled).toBe(false);
  });

  it('does not persist unrelated resolved CLI/env config when applying init backend', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.fbeast');
    const configFile = join(frankenbeastDir, 'config.json');
    const resolvedConfig = defaultConfig();
    resolvedConfig.enableTracing = true;
    resolvedConfig.network.secureBackend = 'local-encrypted';

    await handleInitCommand({
      args: {
        subcommand: 'init',
        networkAction: undefined,
        networkTarget: undefined,
        networkDetached: false,
        networkSet: undefined,
        baseDir: tempDir,
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
        initVerify: false,
        initRepair: false,
        initNonInteractive: false,
        initBackend: 'local-encrypted',
      },
      config: resolvedConfig,
      io: {
        ask: async (prompt: string) => {
          switch (prompt) {
            case 'Enter passphrase for local encrypted store:':
              return 'test-passphrase';
            case 'Enable Chat? [Y/n]':
              return 'n';
            case 'Enable Dashboard? [Y/n]':
              return 'n';
            case 'Enable Comms? [y/N]':
              return 'n';
            case 'Default provider [claude]':
              return '';
            case 'Security mode [secure/insecure] (default: secure)':
              return '';
            case 'Enter operator token (leave blank to auto-generate):':
              return '';
            default:
              return '';
          }
        },
        display: () => undefined,
      },
      paths: makePaths(tempDir, configFile),
      print: () => undefined,
    });

    const config = JSON.parse(await readFile(configFile, 'utf-8')) as { enableTracing: boolean; network: { secureBackend: string } };

    expect(config.network.secureBackend).toBe('local-encrypted');
    expect(config.enableTracing).toBe(false);
  });

  it('fails fast without prompting when init is non-interactive and config is missing', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.fbeast');
    const configFile = join(frankenbeastDir, 'config.json');
    const ask = vi.fn(async () => {
      throw new Error('unexpected prompt');
    });

    await expect(handleInitCommand({
      args: {
        subcommand: 'init',
        networkAction: undefined,
        networkTarget: undefined,
        networkDetached: false,
        networkSet: undefined,
        baseDir: tempDir,
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
        initVerify: false,
        initRepair: false,
        initNonInteractive: true,
      },
      config: defaultConfig(),
      io: {
        ask,
        display: () => undefined,
      },
      paths: makePaths(tempDir, configFile),
      print: () => undefined,
    })).rejects.toThrow(/Cannot run init non-interactively[\s\S]*Config file is missing[\s\S]*Init state is missing/);

    expect(ask).not.toHaveBeenCalled();
  });

  it('verifies an explicit --config path instead of the project-local config', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.fbeast');
    const configFile = join(frankenbeastDir, 'config.json');
    const explicitConfigFile = join(tempDir, 'explicit-bad-config.json');
    await mkdir(frankenbeastDir, { recursive: true });
    await writeFile(configFile, JSON.stringify(defaultConfig()), 'utf-8');
    await writeFile(explicitConfigFile, '{ invalid json', 'utf-8');
    const print = vi.fn();

    await handleInitCommand({
      args: makeArgs({ config: explicitConfigFile, initVerify: true }),
      config: defaultConfig(),
      io: { ask: async () => '', display: () => undefined },
      paths: makePaths(tempDir, configFile),
      print,
    });

    expect(print).toHaveBeenCalledWith(expect.stringContaining(explicitConfigFile));
    expect(print).toHaveBeenCalledWith(expect.stringContaining('could not be parsed'));
  });

  it('repairs malformed config JSON without aborting after quarantine', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.fbeast');
    const configFile = join(frankenbeastDir, 'config.json');
    await mkdir(frankenbeastDir, { recursive: true });
    await writeFile(configFile, '{ invalid json', 'utf-8');
    const ask = vi.fn(async (prompt: string) => {
      switch (prompt) {
        case 'Enter passphrase for local encrypted store:':
          return 'test-passphrase';
        case 'Enable Chat? [Y/n]':
          return 'n';
        case 'Enable Dashboard? [Y/n]':
          return 'n';
        case 'Enable Comms? [y/N]':
          return 'n';
        case 'Default provider [claude]':
          return '';
        case 'Security mode [secure/insecure] (default: secure)':
          return '';
        case 'Enter operator token (leave blank to auto-generate):':
          return '';
        default:
          return '';
      }
    });
    const print = vi.fn();

    await handleInitCommand({
      args: makeArgs({ initRepair: true }),
      config: defaultConfig(),
      io: { ask, display: () => undefined },
      paths: makePaths(tempDir, configFile),
      print,
    });

    const repaired = JSON.parse(await readFile(configFile, 'utf-8')) as { chat: { enabled: boolean } };
    expect(repaired.chat.enabled).toBe(false);
    expect(print).toHaveBeenCalledWith(expect.stringContaining('Repaired init config'));
  });
});
