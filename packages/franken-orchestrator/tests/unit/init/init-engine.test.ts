import { afterEach, describe, expect, it, vi } from 'vitest';
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInteractiveInit, runRepairInit } from '../../../src/init/init-engine.js';
import { FileInitStateStore } from '../../../src/init/init-state-store.js';
import { createEmptyInitState } from '../../../src/init/init-types.js';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';

function scriptedIo(...answers: string[]) {
  const prompts: string[] = [];
  const queue = [...answers];
  return {
    prompts,
    io: {
      ask: async (prompt: string) => {
        prompts.push(prompt);
        return queue.shift() ?? '';
      },
      display: (_message: string) => undefined,
    },
  };
}

describe('runInteractiveInit', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    vi.restoreAllMocks();
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('sets top-level config flags and selected comms transport config', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const { io } = scriptedIo(
      'y', // chat
      'n', // dashboard
      'y', // comms
      'codex', // provider
      'secure', // security mode
      'y', // slack
      'workspace-app',
      'op://slack/bot-token',
      'op://slack/signing-secret',
      'n', // discord
    );

    const result = await runInteractiveInit({
      configFile,
      stateStore,
      io,
    });

    expect(result.config.chat.enabled).toBe(true);
    expect(result.config.dashboard.enabled).toBe(false);
    expect(result.config.comms.enabled).toBe(true);
    expect(result.config.providers.default).toBe('codex');
    expect(result.config.network.mode).toBe('secure');
    expect(result.config.comms.slack).toMatchObject({
      enabled: true,
      appId: 'workspace-app',
      botTokenRef: 'op://slack/bot-token',
      signingSecretRef: 'op://slack/signing-secret',
    });
    expect(result.config.comms.discord.enabled).toBe(false);
    expect(result.state.selectedModules).toEqual(['chat', 'comms']);
    expect(result.state.selectedCommsTransports).toEqual(['slack']);
  });

  it('skips comms transport prompts when comms is disabled', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const { io, prompts } = scriptedIo(
      'n', // chat
      'y', // dashboard
      'n', // comms
      'claude', // provider
      'secure', // security mode
    );

    const result = await runInteractiveInit({
      configFile,
      stateStore,
      io,
    });

    expect(result.config.chat.enabled).toBe(false);
    expect(result.config.dashboard.enabled).toBe(true);
    expect(result.config.comms.enabled).toBe(false);
    expect(prompts.some((prompt) => prompt.includes('Slack'))).toBe(false);
    expect(prompts.some((prompt) => prompt.includes('Discord'))).toBe(false);
  });

  it('preserves a CLI-provided init secret backend in the saved config', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const { io } = scriptedIo(
      'n', // chat
      'y', // dashboard
      'n', // comms
      'claude', // provider
      'secure', // security mode
    );
    const baseConfig = defaultConfig();

    const result = await runInteractiveInit({
      configFile,
      stateStore,
      io,
      baseConfig: {
        ...baseConfig,
        network: {
          ...baseConfig.network,
          secureBackend: '1password',
        },
      },
    });

    expect(result.config.network.secureBackend).toBe('1password');
  });

  it('reports malformed init JSON before repair reloads files', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const { io } = scriptedIo();
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, '{"comms": ', 'utf-8');
    await stateStore.save(createEmptyInitState(configFile));

    await expect(runRepairInit({ configFile, stateStore, io })).rejects.toThrow(
      /Cannot repair init because required init JSON is malformed:[\s\S]*Config file[\s\S]*could not be parsed/,
    );
  });

  it('repairs malformed init state by rebuilding it from valid config defaults', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateFile = join(tempDir, '.fbeast', 'init-state.json');
    const stateStore = new FileInitStateStore(stateFile);
    const config = defaultConfig();
    config.chat.enabled = true;
    config.network.mode = 'insecure';
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await writeFile(stateFile, '{"answers": {', 'utf-8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { io } = scriptedIo(
      '', // keep chat enabled from config
      '', // keep dashboard from config
      '', // keep comms from config
      '', // keep provider from config
      '', // keep security mode from config
    );

    const result = await runRepairInit({ configFile, stateStore, io });

    expect(result.config.chat.enabled).toBe(true);
    expect(result.state.configPath).toBe(configFile);
    expect(result.state.selectedModules).toEqual(['chat', 'dashboard']);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Malformed init verification JSON'));
  });

  it('repairs non-object init state by rebuilding it from valid config defaults', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateFile = join(tempDir, '.fbeast', 'init-state.json');
    const stateStore = new FileInitStateStore(stateFile);
    const config = defaultConfig();
    config.chat.enabled = true;
    config.network.mode = 'insecure';
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await writeFile(stateFile, 'null\n', 'utf-8');
    const { io } = scriptedIo(
      '', // keep chat enabled from config
      '', // keep dashboard from config
      '', // keep comms from config
      '', // keep provider from config
      '', // keep security mode from config
    );

    const result = await runRepairInit({ configFile, stateStore, io });

    expect(result.config.chat.enabled).toBe(true);
    expect(result.config.network.mode).toBe('insecure');
    expect(result.state.configPath).toBe(configFile);
    expect(result.state.securityMode).toBe('insecure');
    expect(result.state.selectedModules).toEqual(['chat', 'dashboard']);
  });

  it('resumes from saved init state defaults instead of starting from scratch', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    await stateStore.save({
      ...createEmptyInitState(configFile),
      selectedModules: ['chat', 'comms'],
      selectedCommsTransports: ['slack'],
      completedSteps: ['module-selection', 'provider-config', 'comms-transport-selection'],
      answers: {
        'providers.default': 'codex',
        'comms.slack.appId': 'existing-app',
        'comms.slack.botTokenRef': 'op://existing/slack-bot-token',
        'comms.slack.signingSecretRef': 'op://existing/slack-signing-secret',
      },
    });
    const { io } = scriptedIo(
      '', // keep chat enabled
      '', // keep dashboard disabled
      '', // keep comms enabled
      '', // keep provider codex
      '', // keep secure
      '', // keep slack enabled
      '', // keep app id
      '', // keep bot token ref
      '', // keep signing secret ref
      'n', // discord disabled
    );

    const result = await runInteractiveInit({
      configFile,
      stateStore,
      io,
    });

    expect(result.config.providers.default).toBe('codex');
    expect(result.config.comms.slack.appId).toBe('existing-app');
    expect(result.config.comms.slack.botTokenRef).toBe('op://existing/slack-bot-token');
    expect(result.config.comms.slack.signingSecretRef).toBe('op://existing/slack-signing-secret');
    expect(result.state.selectedModules).toEqual(['chat', 'comms']);
    expect(result.state.selectedCommsTransports).toEqual(['slack']);
  });

  it('quarantines malformed existing config and continues with defaults', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, '{"chat": {', 'utf-8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { io } = scriptedIo(
      'n', // chat default false after corrupt config fallback
      'y', // dashboard
      'n', // comms
      'claude', // provider
      'secure', // security mode
    );

    const result = await runInteractiveInit({
      configFile,
      stateStore,
      io,
    });
    const files = await readdir(join(tempDir, '.fbeast'));
    const quarantine = files.find((file) => file.startsWith('config.json.corrupt-'));

    expect(result.config.chat.enabled).toBe(false);
    expect(result.config.dashboard.enabled).toBe(true);
    expect(result.config.comms.enabled).toBe(false);
    expect(quarantine).toBeTruthy();
    await expect(readFile(join(tempDir, '.fbeast', quarantine ?? ''), 'utf-8')).resolves.toBe('{"chat": {');
    await expect(readFile(configFile, 'utf-8')).resolves.toContain('"dashboard"');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Malformed orchestrator config JSON'));
  });

  it('preserves config-backed comms answers when malformed init state is quarantined', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-engine-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateFile = join(tempDir, '.fbeast', 'init-state.json');
    const stateStore = new FileInitStateStore(stateFile);
    const config = defaultConfig();
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify({
      ...config,
      chat: { ...config.chat, enabled: true },
      comms: {
        ...config.comms,
        enabled: false,
        slack: {
          ...config.comms.slack,
          enabled: true,
          appId: 'existing-app',
          botTokenRef: 'op://existing/slack-bot-token',
          signingSecretRef: 'op://existing/slack-signing-secret',
        },
      },
      providers: { ...config.providers, default: 'codex' },
    }), 'utf-8');
    await writeFile(stateFile, '{"answers": {', 'utf-8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { io } = scriptedIo(
      '', // keep chat enabled from config
      '', // keep dashboard from config
      '', // keep comms enabled from config
      '', // keep provider from config
      '', // keep security mode from config
      '', // keep slack enabled from config
      '', // keep app id from config
      '', // keep bot token ref from config
      '', // keep signing secret ref from config
      'n', // discord disabled
    );

    const result = await runInteractiveInit({
      configFile,
      stateStore,
      io,
    });

    expect(result.config.providers.default).toBe('codex');
    expect(result.config.comms.slack.appId).toBe('existing-app');
    expect(result.config.comms.slack.botTokenRef).toBe('op://existing/slack-bot-token');
    expect(result.config.comms.slack.signingSecretRef).toBe('op://existing/slack-signing-secret');
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('Malformed init state JSON'));
  });
});
