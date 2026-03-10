import type { InterviewIO } from '../planning/interview-loop.js';
import { OrchestratorConfigSchema, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { listSupportedCommsTransports } from './comms-transport-registry.js';
import type { InitState, SupportedCommsTransportId } from './init-types.js';

export interface InitWizardResult {
  config: OrchestratorConfig;
  state: InitState;
}

interface RunInitWizardOptions {
  io: InterviewIO;
  initialState: InitState;
  baseConfig?: OrchestratorConfig;
}

function stateValue<T>(state: InitState, key: string): T | undefined {
  return state.answers[key] as T | undefined;
}

function moduleDefault(state: InitState, config: OrchestratorConfig, id: 'chat' | 'dashboard' | 'comms'): boolean {
  if (state.selectedModules.length > 0) {
    return state.selectedModules.includes(id);
  }
  return config[id].enabled;
}

function transportDefault(state: InitState, config: OrchestratorConfig, id: SupportedCommsTransportId): boolean {
  if (state.selectedCommsTransports.length > 0) {
    return state.selectedCommsTransports.includes(id);
  }
  return config.comms[id].enabled;
}

async function askBoolean(io: InterviewIO, prompt: string, defaultValue: boolean): Promise<boolean> {
  const raw = (await io.ask(prompt)).trim().toLowerCase();
  if (raw.length === 0) {
    return defaultValue;
  }
  return raw === 'y' || raw === 'yes' || raw === 'true';
}

async function askText(io: InterviewIO, prompt: string, defaultValue: string): Promise<string> {
  const raw = await io.ask(prompt);
  const trimmed = raw.trim();
  return trimmed.length > 0 ? trimmed : defaultValue;
}

function buildConfig(baseConfig: OrchestratorConfig, state: InitState): OrchestratorConfig {
  return OrchestratorConfigSchema.parse({
    ...baseConfig,
    providers: {
      ...baseConfig.providers,
      default: String(stateValue(state, 'providers.default') ?? baseConfig.providers.default),
    },
    network: {
      ...baseConfig.network,
      mode: state.securityMode,
    },
    chat: {
      ...baseConfig.chat,
      enabled: state.selectedModules.includes('chat'),
    },
    dashboard: {
      ...baseConfig.dashboard,
      enabled: state.selectedModules.includes('dashboard'),
    },
    comms: {
      ...baseConfig.comms,
      enabled: state.selectedModules.includes('comms'),
      slack: {
        ...baseConfig.comms.slack,
        enabled: state.selectedCommsTransports.includes('slack'),
        appId: stateValue(state, 'comms.slack.appId') as string | undefined,
        botTokenRef: stateValue(state, 'comms.slack.botTokenRef') as string | undefined,
        signingSecretRef: stateValue(state, 'comms.slack.signingSecretRef') as string | undefined,
      },
      discord: {
        ...baseConfig.comms.discord,
        enabled: state.selectedCommsTransports.includes('discord'),
        applicationId: stateValue(state, 'comms.discord.applicationId') as string | undefined,
        botTokenRef: stateValue(state, 'comms.discord.botTokenRef') as string | undefined,
        publicKeyRef: stateValue(state, 'comms.discord.publicKeyRef') as string | undefined,
      },
    },
  });
}

export async function runInitWizard(options: RunInitWizardOptions): Promise<InitWizardResult> {
  const config = options.baseConfig ?? defaultConfig();
  const selectedModules: Array<'chat' | 'dashboard' | 'comms'> = [];

  const enableChat = await askBoolean(options.io, 'Enable Chat? [Y/n]', moduleDefault(options.initialState, config, 'chat'));
  if (enableChat) {
    selectedModules.push('chat');
  }

  const enableDashboard = await askBoolean(options.io, 'Enable Dashboard? [Y/n]', moduleDefault(options.initialState, config, 'dashboard'));
  if (enableDashboard) {
    selectedModules.push('dashboard');
  }

  const enableComms = await askBoolean(options.io, 'Enable Comms? [y/N]', moduleDefault(options.initialState, config, 'comms'));
  if (enableComms) {
    selectedModules.push('comms');
  }

  const providerDefault = await askText(
    options.io,
    `Default provider [${String(stateValue(options.initialState, 'providers.default') ?? config.providers.default)}]`,
    String(stateValue(options.initialState, 'providers.default') ?? config.providers.default),
  );

  const securityMode = await askText(
    options.io,
    'Security mode [secure/insecure] (default: secure)',
    options.initialState.securityMode,
  ) as 'secure' | 'insecure';

  const selectedCommsTransports: SupportedCommsTransportId[] = [];
  const answers: Record<string, unknown> = {
    ...options.initialState.answers,
    'providers.default': providerDefault,
  };

  if (enableComms) {
    for (const transport of listSupportedCommsTransports()) {
      const enabled = await askBoolean(
        options.io,
        `Enable ${transport.label}? [y/N]`,
        transportDefault(options.initialState, config, transport.id),
      );

      if (!enabled) {
        continue;
      }

      selectedCommsTransports.push(transport.id);

      if (transport.id === 'slack') {
        answers['comms.slack.appId'] = await askText(
          options.io,
          'Slack app ID',
          String(stateValue(options.initialState, 'comms.slack.appId') ?? ''),
        );
        answers['comms.slack.botTokenRef'] = await askText(
          options.io,
          'Slack bot token ref',
          String(stateValue(options.initialState, 'comms.slack.botTokenRef') ?? ''),
        );
        answers['comms.slack.signingSecretRef'] = await askText(
          options.io,
          'Slack signing secret ref',
          String(stateValue(options.initialState, 'comms.slack.signingSecretRef') ?? ''),
        );
      }

      if (transport.id === 'discord') {
        answers['comms.discord.applicationId'] = await askText(
          options.io,
          'Discord application ID',
          String(stateValue(options.initialState, 'comms.discord.applicationId') ?? ''),
        );
        answers['comms.discord.botTokenRef'] = await askText(
          options.io,
          'Discord bot token ref',
          String(stateValue(options.initialState, 'comms.discord.botTokenRef') ?? ''),
        );
        answers['comms.discord.publicKeyRef'] = await askText(
          options.io,
          'Discord public key ref',
          String(stateValue(options.initialState, 'comms.discord.publicKeyRef') ?? ''),
        );
      }
    }
  }

  const nextState: InitState = {
    ...options.initialState,
    selectedModules,
    selectedCommsTransports,
    completedSteps: enableComms
      ? ['module-selection', 'provider-config', 'security-selection', 'comms-transport-selection']
      : ['module-selection', 'provider-config', 'security-selection'],
    securityMode,
    answers,
  };

  return {
    config: buildConfig(config, nextState),
    state: nextState,
  };
}
