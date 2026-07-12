import type { InterviewIO } from '../planning/interview-loop.js';
import { parseOrchestratorConfig, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { FileInitStateStore } from './init-state-store.js';
import { runInitWizard } from './init-wizard.js';
import type { InitState, InitModuleId, SupportedCommsTransportId } from './init-types.js';
import { createEmptyInitState } from './init-types.js';
import { verifyInit } from './init-verify.js';
import type { ISecretStore } from '../network/secret-store.js';
import { readJsonFileOrDefault, warnJsonQuarantined, writeJsonFileAtomic } from './init-json-file.js';

export interface InitEngineResult {
  config: OrchestratorConfig;
  state: InitState;
}

interface RunInteractiveInitOptions {
  configFile: string;
  stateStore: FileInitStateStore;
  io: InterviewIO;
  baseConfig?: OrchestratorConfig | undefined;
  initBackend?: OrchestratorConfig['network']['secureBackend'] | undefined;
  secretStore?: ISecretStore | undefined;
  allowTrustedProviderCommandOverrides?: boolean | undefined;
}

type RunRepairInitOptions = RunInteractiveInitOptions;

async function loadExistingConfig(
  configFile: string,
  options: { allowTrustedProviderCommandOverrides?: boolean | undefined } = {},
): Promise<OrchestratorConfig> {
  const rawConfig = await readJsonFileOrDefault(configFile, defaultConfig, {
    description: 'orchestrator config',
    onCorrupt: warnJsonQuarantined,
  });
  return parseOrchestratorConfig(rawConfig, {
      allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });
}

async function resolveBaseConfig(options: RunInteractiveInitOptions): Promise<OrchestratorConfig> {
  const baseConfig = options.baseConfig ?? await loadExistingConfig(options.configFile, {
    allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });
  if (!options.initBackend) {
    return baseConfig;
  }
  return {
    ...baseConfig,
    network: {
      ...baseConfig.network,
      secureBackend: options.initBackend,
    },
  };
}

async function saveConfig(configFile: string, config: OrchestratorConfig): Promise<void> {
  await writeJsonFileAtomic(configFile, config);
}

function initStateFromConfig(configPath: string, config: OrchestratorConfig): InitState {
  const selectedModules: InitModuleId[] = [];
  if (config.chat.enabled) selectedModules.push('chat');
  if (config.dashboard.enabled) selectedModules.push('dashboard');

  const selectedCommsTransports: SupportedCommsTransportId[] = [];
  if (config.comms.slack.enabled) selectedCommsTransports.push('slack');
  if (config.comms.discord.enabled) selectedCommsTransports.push('discord');
  if (config.comms.telegram.enabled) selectedCommsTransports.push('telegram');
  if (config.comms.whatsapp.enabled) selectedCommsTransports.push('whatsapp');
  if (config.comms.enabled || selectedCommsTransports.length > 0) selectedModules.push('comms');

  return {
    ...createEmptyInitState(configPath),
    selectedModules,
    selectedCommsTransports,
    securityMode: config.network.mode,
    answers: {
      'providers.default': config.providers.default,
      'network.operatorTokenRef': config.network.operatorTokenRef,
      'comms.slack.appId': config.comms.slack.appId,
      'comms.slack.botTokenRef': config.comms.slack.botTokenRef,
      'comms.slack.signingSecretRef': config.comms.slack.signingSecretRef,
      'comms.discord.applicationId': config.comms.discord.applicationId,
      'comms.discord.botTokenRef': config.comms.discord.botTokenRef,
      'comms.discord.publicKeyRef': config.comms.discord.publicKeyRef,
      'comms.telegram.botTokenRef': config.comms.telegram.botTokenRef,
      'comms.telegram.webhookSecretTokenRef': config.comms.telegram.webhookSecretTokenRef,
      'comms.whatsapp.accessTokenRef': config.comms.whatsapp.accessTokenRef,
      'comms.whatsapp.phoneNumberIdRef': config.comms.whatsapp.phoneNumberIdRef,
      'comms.whatsapp.appSecretRef': config.comms.whatsapp.appSecretRef,
      'comms.whatsapp.verifyTokenRef': config.comms.whatsapp.verifyTokenRef,
    },
  };
}

export async function runInteractiveInit(options: RunInteractiveInitOptions): Promise<InitEngineResult> {
  const baseConfig = await resolveBaseConfig(options);
  const initialState = await options.stateStore.load(options.configFile, () => initStateFromConfig(options.configFile, baseConfig));
  const result = await runInitWizard({
    io: options.io,
    initialState,
    baseConfig,
    secretStore: options.secretStore,
    allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });

  await saveConfig(options.configFile, result.config);
  const state = await options.stateStore.save(result.state);

  return {
    config: result.config,
    state,
  };
}

export async function runRepairInit(options: RunRepairInitOptions): Promise<InitEngineResult> {
  const verification = await verifyInit({
    configFile: options.configFile,
    stateStore: options.stateStore,
    allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });

  if (verification.ok) {
    const state = await options.stateStore.load(options.configFile);
    return {
      config: verification.config ?? defaultConfig(),
      state,
    };
  }

  const invalidJsonIssues = verification.issues.filter((issue) =>
    issue.code === 'invalid-config-json');
  if (invalidJsonIssues.length > 0) {
    throw new Error(
      [
        'Cannot repair init because required init JSON is malformed:',
        ...invalidJsonIssues.map((issue) => `- ${issue.message}`),
      ].join('\n'),
    );
  }

  const needsFullWizard = verification.issues.some((issue) =>
    issue.code === 'missing-config' || issue.code === 'missing-init-state');
  if (needsFullWizard) {
    return runInteractiveInit(options);
  }

  const initialState = await options.stateStore.load(options.configFile);
  const baseConfig = await resolveBaseConfig(options);
  const scope = verification.issues.flatMap((issue) => {
    switch (issue.code) {
      case 'slack-incomplete':
        return ['slack'] as const;
      case 'discord-incomplete':
        return ['discord'] as const;
      case 'telegram-incomplete':
        return ['telegram'] as const;
      case 'whatsapp-incomplete':
        return ['whatsapp'] as const;
      default:
        return [] as const;
    }
  });
  const result = await runInitWizard({
    io: options.io,
    initialState,
    baseConfig,
    scope,
    secretStore: options.secretStore,
    allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });

  await saveConfig(options.configFile, result.config);
  const state = await options.stateStore.save(result.state);

  return {
    config: result.config,
    state,
  };
}
