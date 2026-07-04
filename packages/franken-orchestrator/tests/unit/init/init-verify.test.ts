import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { defaultConfig } from '../../../src/config/orchestrator-config.js';
import { runRepairInit } from '../../../src/init/init-engine.js';
import { FileInitStateStore } from '../../../src/init/init-state-store.js';
import { createEmptyInitState } from '../../../src/init/init-types.js';
import { verifyInit } from '../../../src/init/init-verify.js';

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

describe('verifyInit', () => {
  let tempDir: string | undefined;

  afterEach(async () => {
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = undefined;
    }
  });

  it('reports missing config and init state clearly', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-verify-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));

    const result = await verifyInit({
      configFile,
      stateStore,
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join('\n')).toContain('Config file is missing');
    expect(result.messages.join('\n')).toContain('Init state is missing');
  });

  it('checks only enabled comms transports', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-verify-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.slack.enabled = true;
    config.comms.discord.enabled = false;
    config.comms.slack.appId = 'workspace-app';
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await stateStore.save({
      ...createEmptyInitState(configFile),
      selectedModules: ['comms'],
      selectedCommsTransports: ['slack'],
    });

    const result = await verifyInit({
      configFile,
      stateStore,
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join('\n')).toContain('Slack');
    expect(result.messages.join('\n')).not.toContain('Discord');
  });

  it('validates enabled Telegram and WhatsApp transports', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-verify-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.telegram.enabled = true;
    config.comms.whatsapp.enabled = true;
    config.comms.whatsapp.accessTokenRef = 'op://whatsapp/access-token';
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await stateStore.save({
      ...createEmptyInitState(configFile),
      selectedModules: ['comms'],
      selectedCommsTransports: ['telegram', 'whatsapp'],
    });

    const result = await verifyInit({
      configFile,
      stateStore,
    });

    expect(result.ok).toBe(false);
    expect(result.messages.join('\n')).toContain('Telegram config is incomplete: missing botTokenRef');
    expect(result.messages.join('\n')).toContain('WhatsApp config is incomplete: missing phoneNumberIdRef, appSecretRef, verifyTokenRef');
  });

  it('repair revisits only failing sections and preserves valid answers', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-verify-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const config = defaultConfig();
    config.providers.default = 'codex';
    config.chat.enabled = true;
    config.comms.enabled = true;
    config.comms.slack.enabled = true;
    config.comms.slack.appId = 'existing-app';
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await stateStore.save({
      ...createEmptyInitState(configFile),
      selectedModules: ['chat', 'comms'],
      selectedCommsTransports: ['slack'],
      completedSteps: ['module-selection', 'provider-config', 'security-selection', 'comms-transport-selection'],
      answers: {
        'providers.default': 'codex',
        'comms.slack.appId': 'existing-app',
      },
    });
    const { io, prompts } = scriptedIo(
      'op://slack/bot-token',
      'op://slack/signing-secret',
    );

    const result = await runRepairInit({
      configFile,
      stateStore,
      io,
    });

    expect(result.config.providers.default).toBe('codex');
    expect(result.config.comms.slack.appId).toBe('existing-app');
    expect(result.config.comms.slack.botTokenRef).toBe('op://slack/bot-token');
    expect(result.config.comms.slack.signingSecretRef).toBe('op://slack/signing-secret');
    expect(prompts.some((prompt) => prompt.includes('Enable Chat'))).toBe(false);
    expect(prompts.some((prompt) => prompt.includes('Default provider'))).toBe(false);
  });

  it('repair maps Telegram and WhatsApp verification issues to their transport scopes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'franken-init-verify-'));
    const configFile = join(tempDir, '.fbeast', 'config.json');
    const stateStore = new FileInitStateStore(join(tempDir, '.fbeast', 'init-state.json'));
    const config = defaultConfig();
    config.comms.enabled = true;
    config.comms.telegram.enabled = true;
    config.comms.whatsapp.enabled = true;
    await mkdir(join(tempDir, '.fbeast'), { recursive: true });
    await writeFile(configFile, JSON.stringify(config, null, 2) + '\n', 'utf-8');
    await stateStore.save({
      ...createEmptyInitState(configFile),
      selectedModules: ['comms'],
      selectedCommsTransports: ['telegram', 'whatsapp'],
      completedSteps: ['module-selection', 'provider-config', 'security-selection', 'comms-transport-selection'],
    });
    const { io, prompts } = scriptedIo(
      'op://telegram/bot-token',
      'op://whatsapp/access-token',
      'wa-phone-number-id',
      'op://whatsapp/app-secret',
      'op://whatsapp/verify-token',
    );

    const result = await runRepairInit({
      configFile,
      stateStore,
      io,
    });

    expect(result.config.comms.telegram.botTokenRef).toBe('op://telegram/bot-token');
    expect(result.config.comms.whatsapp.accessTokenRef).toBe('op://whatsapp/access-token');
    expect(result.config.comms.whatsapp.phoneNumberIdRef).toBe('wa-phone-number-id');
    expect(result.config.comms.whatsapp.appSecretRef).toBe('op://whatsapp/app-secret');
    expect(result.config.comms.whatsapp.verifyTokenRef).toBe('op://whatsapp/verify-token');
    expect(prompts.every((prompt) => !prompt.includes('Enable Slack'))).toBe(true);
    expect(prompts.every((prompt) => !prompt.includes('Enable Discord'))).toBe(true);
  });
});
