import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { handleInitCommand } from '../../../src/cli/init-command.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

describe('handleInitCommand', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('writes canonical config and init state using the project paths', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-command-'));
    const frankenbeastDir = join(tempDir, '.frankenbeast');
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
      paths: {
        root: tempDir,
        frankenbeastDir,
        llmCacheDir: join(frankenbeastDir, '.cache', 'llm'),
        plansDir: join(frankenbeastDir, 'plans'),
        buildDir: join(frankenbeastDir, '.build'),
        beastsDir: join(frankenbeastDir, '.build', 'beasts'),
        beastLogsDir: join(frankenbeastDir, '.build', 'beasts', 'logs'),
        beastsDb: join(frankenbeastDir, '.build', 'beasts.db'),
        chunkSessionsDir: join(frankenbeastDir, '.build', 'chunk-sessions'),
        chunkSessionSnapshotsDir: join(frankenbeastDir, '.build', 'chunk-session-snapshots'),
        checkpointFile: join(frankenbeastDir, '.build', '.checkpoint'),
        tracesDb: join(frankenbeastDir, '.build', 'build-traces.db'),
        logFile: join(frankenbeastDir, '.build', 'build.log'),
        designDocFile: join(frankenbeastDir, 'plans', 'design.md'),
        configFile,
        llmResponseFile: join(frankenbeastDir, 'plans', 'llm-response.json'),
      },
      print: () => undefined,
    });

    const config = JSON.parse(await readFile(configFile, 'utf-8')) as { chat: { enabled: boolean }; dashboard: { enabled: boolean } };
    const initState = JSON.parse(await readFile(initStateFile, 'utf-8')) as { selectedModules: string[] };

    expect(config.chat.enabled).toBe(true);
    expect(config.dashboard.enabled).toBe(false);
    expect(initState.selectedModules).toEqual(['chat']);
  });
});
