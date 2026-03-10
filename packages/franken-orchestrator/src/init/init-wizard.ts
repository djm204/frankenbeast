import type { InterviewIO } from '../planning/interview-loop.js';
import { OrchestratorConfigSchema, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { listSupportedCommsTransports } from './comms-transport-registry.js';
import type { InitState, SupportedCommsTransportId } from './init-types.js';

export interface InitWizardResult {
  config: OrchestratorConfig;
  state: InitState;
}

export type InitWizardScope = 'modules' | 'provider' | 'security' | 'slack' | 'discord';

interface RunInitWizardOptions {
  io: InterviewIO;
  initialState: InitState;
  baseConfig?: OrchestratorConfig;
  scope?: readonly InitWizardScope[];
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
  const scope = new Set<InitWizardScope>(options.scope ?? ['modules', 'provider', 'security', 'slack', 'discord']);

  let enableChat = moduleDefault(options.initialState, config, 'chat');
  let enableDashboard = moduleDefault(options.initialState, config, 'dashboard');
  let enableComms = moduleDefault(options.initialState, config, 'comms');
  if (scope.has('modules')) {
    enableChat = await askBoolean(options.io, 'Enable Chat? [Y/n]', enableChat);
    enableDashboard = await askBoolean(options.io, 'Enable Dashboard? [Y/n]', enableDashboard);
    enableComms = await askBoolean(options.io, 'Enable Comms? [y/N]', enableComms);
  }
  const selectedModules: Array<'chat' | 'dashboard' | 'comms'> = [];
  if (enableChat) selectedModules.push('chat');
  if (enableDashboard) selectedModules.push('dashboard');
  if (enableComms) selectedModules.push('comms');

  const currentProviderDefault = String(stateValue(options.initialState, 'providers.default') ?? config.providers.default);
  const providerDefault = scope.has('provider')
    ? await askText(options.io, `Default provider [${currentProviderDefault}]`, currentProviderDefault)
    : currentProviderDefault;

  const securityMode = scope.has('security')
    ? await askText(options.io, 'Security mode [secure/insecure] (default: secure)', options.initialState.securityMode) as 'secure' | 'insecure'
    : options.initialState.securityMode;

  const selectedCommsTransports: SupportedCommsTransportId[] = enableComms
    ? listSupportedCommsTransports()
      .filter((transport) => transportDefault(options.initialState, config, transport.id))
      .map((transport) => transport.id)
    : [];
  const answers: Record<string, unknown> = {
    ...options.initialState.answers,
    'providers.default': providerDefault,
  };

  if (enableComms) {
    for (const transport of listSupportedCommsTransports()) {
      const targetedTransportOnly = options.scope !== undefined
        && !options.scope.includes('modules')
        && !options.scope.includes('provider')
        && !options.scope.includes('security')
        && options.scope.includes(transport.id);
      const enabled = targetedTransportOnly
        ? transportDefault(options.initialState, config, transport.id)
        : await askBoolean(
          options.io,
          `Enable ${transport.label}? [y/N]`,
          transportDefault(options.initialState, config, transport.id),
        );

      if (!enabled) {
        if (!targetedTransportOnly) {
          const index = selectedCommsTransports.indexOf(transport.id);
          if (index >= 0) {
            selectedCommsTransports.splice(index, 1);
          }
        }
        continue;
      }

      if (!selectedCommsTransports.includes(transport.id)) {
        selectedCommsTransports.push(transport.id);
      }

      if (transport.id === 'slack') {
        const currentAppId = String(stateValue(options.initialState, 'comms.slack.appId') ?? '');
        if (!scope.has('slack') || currentAppId.length === 0) {
          answers['comms.slack.appId'] = await askText(options.io, 'Slack app ID', currentAppId);
        }
        const currentBotTokenRef = String(stateValue(options.initialState, 'comms.slack.botTokenRef') ?? '');
        if (!scope.has('slack') || currentBotTokenRef.length === 0) {
          answers['comms.slack.botTokenRef'] = await askText(options.io, 'Slack bot token ref', currentBotTokenRef);
        }
        const currentSigningSecretRef = String(stateValue(options.initialState, 'comms.slack.signingSecretRef') ?? '');
        if (!scope.has('slack') || currentSigningSecretRef.length === 0) {
          answers['comms.slack.signingSecretRef'] = await askText(options.io, 'Slack signing secret ref', currentSigningSecretRef);
        }
      }

      if (transport.id === 'discord') {
        const currentApplicationId = String(stateValue(options.initialState, 'comms.discord.applicationId') ?? '');
        if (!scope.has('discord') || currentApplicationId.length === 0) {
          answers['comms.discord.applicationId'] = await askText(options.io, 'Discord application ID', currentApplicationId);
        }
        const currentBotTokenRef = String(stateValue(options.initialState, 'comms.discord.botTokenRef') ?? '');
        if (!scope.has('discord') || currentBotTokenRef.length === 0) {
          answers['comms.discord.botTokenRef'] = await askText(options.io, 'Discord bot token ref', currentBotTokenRef);
        }
        const currentPublicKeyRef = String(stateValue(options.initialState, 'comms.discord.publicKeyRef') ?? '');
        if (!scope.has('discord') || currentPublicKeyRef.length === 0) {
          answers['comms.discord.publicKeyRef'] = await askText(options.io, 'Discord public key ref', currentPublicKeyRef);
        }
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
