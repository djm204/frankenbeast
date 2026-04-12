import { afterEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { runInteractiveInit } from '../../../src/init/init-engine.js';
import { FileInitStateStore } from '../../../src/init/init-state-store.js';
import { createEmptyInitState } from '../../../src/init/init-types.js';

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
});
