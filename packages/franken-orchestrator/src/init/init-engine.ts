import type { InterviewIO } from '../planning/interview-loop.js';
import { parseOrchestratorConfig, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { FileInitStateStore } from './init-state-store.js';
import { runInitWizard } from './init-wizard.js';
import type { InitState } from './init-types.js';
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

export async function runInteractiveInit(options: RunInteractiveInitOptions): Promise<InitEngineResult> {
  const initialState = await options.stateStore.load(options.configFile);
  const baseConfig = await resolveBaseConfig(options);
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
