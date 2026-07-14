import { randomBytes } from 'node:crypto';
import type { InterviewIO } from '../planning/interview-loop.js';
import { parseOrchestratorConfig, defaultConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { listSupportedCommsTransports } from './comms-transport-registry.js';
import type { InitState, SupportedCommsTransportId } from './init-types.js';
import type { ISecretStore } from '../network/secret-store.js';

export interface InitWizardResult {
  config: OrchestratorConfig;
  state: InitState;
}

export type InitWizardScope =
  | 'modules'
  | 'provider'
  | 'security'
  | 'slack'
  | 'discord'
  | 'telegram'
  | 'whatsapp'
  | 'secret-backend';

interface RunInitWizardOptions {
  io: InterviewIO;
  initialState: InitState;
  baseConfig?: OrchestratorConfig | undefined;
  scope?: readonly InitWizardScope[] | undefined;
  secretStore?: ISecretStore | undefined;
  allowTrustedProviderCommandOverrides?: boolean | undefined;
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

function hasTransportOnlyScope(scope: readonly InitWizardScope[] | undefined): boolean {
  return scope !== undefined
    && scope.some((item) => item === 'slack' || item === 'discord' || item === 'telegram' || item === 'whatsapp')
    && !scope.includes('modules')
    && !scope.includes('provider')
    && !scope.includes('security');
}

function hasEnabledScopedTransport(config: OrchestratorConfig, scope: readonly InitWizardScope[] | undefined): boolean {
  return hasTransportOnlyScope(scope)
    && scope!.some((item) => (item === 'slack' || item === 'discord' || item === 'telegram' || item === 'whatsapp')
      && config.comms[item].enabled);
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

async function askSecurityMode(io: InterviewIO, defaultValue: 'secure' | 'insecure'): Promise<'secure' | 'insecure'> {
  while (true) {
    const answer = (await askText(io, 'Security mode [secure/insecure] (default: secure)', defaultValue)).toLowerCase();
    if (answer === 'secure' || answer === 'insecure') {
      return answer;
    }
    io.display('Invalid security mode. Enter "secure" or "insecure".');
  }
}

function buildConfig(
  baseConfig: OrchestratorConfig,
  state: InitState,
  options: { allowTrustedProviderCommandOverrides?: boolean | undefined } = {},
): OrchestratorConfig {
  return parseOrchestratorConfig({
    ...baseConfig,
    providers: {
      ...baseConfig.providers,
      default: String(stateValue(state, 'providers.default') ?? baseConfig.providers.default),
    },
    network: {
      ...baseConfig.network,
      mode: state.securityMode,
      operatorTokenRef: stateValue<string>(state, 'network.operatorTokenRef') ?? baseConfig.network.operatorTokenRef,
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
        appId: stateValue<string>(state, 'comms.slack.appId') ?? baseConfig.comms.slack.appId,
        botTokenRef: stateValue<string>(state, 'comms.slack.botTokenRef') ?? baseConfig.comms.slack.botTokenRef,
        signingSecretRef: stateValue<string>(state, 'comms.slack.signingSecretRef') ?? baseConfig.comms.slack.signingSecretRef,
      },
      discord: {
        ...baseConfig.comms.discord,
        enabled: state.selectedCommsTransports.includes('discord'),
        applicationId: stateValue<string>(state, 'comms.discord.applicationId') ?? baseConfig.comms.discord.applicationId,
        botTokenRef: stateValue<string>(state, 'comms.discord.botTokenRef') ?? baseConfig.comms.discord.botTokenRef,
        publicKeyRef: stateValue<string>(state, 'comms.discord.publicKeyRef') ?? baseConfig.comms.discord.publicKeyRef,
      },
      telegram: {
        ...baseConfig.comms.telegram,
        enabled: state.selectedCommsTransports.includes('telegram'),
        botTokenRef: stateValue<string>(state, 'comms.telegram.botTokenRef') ?? baseConfig.comms.telegram.botTokenRef,
        webhookSecretTokenRef: stateValue<string>(state, 'comms.telegram.webhookSecretTokenRef') ?? baseConfig.comms.telegram.webhookSecretTokenRef,
      },
      whatsapp: {
        ...baseConfig.comms.whatsapp,
        enabled: state.selectedCommsTransports.includes('whatsapp'),
        accessTokenRef: stateValue<string>(state, 'comms.whatsapp.accessTokenRef') ?? baseConfig.comms.whatsapp.accessTokenRef,
        phoneNumberIdRef: stateValue<string>(state, 'comms.whatsapp.phoneNumberIdRef') ?? baseConfig.comms.whatsapp.phoneNumberIdRef,
        appSecretRef: stateValue<string>(state, 'comms.whatsapp.appSecretRef') ?? baseConfig.comms.whatsapp.appSecretRef,
        verifyTokenRef: stateValue<string>(state, 'comms.whatsapp.verifyTokenRef') ?? baseConfig.comms.whatsapp.verifyTokenRef,
      },
    },
  }, {
    allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });
}

/**
 * Whether the wizard is running in "secret-backend only" scope — no interactive module/provider/security prompts.
 */
function isSecretBackendOnlyScope(scope: readonly InitWizardScope[] | undefined): boolean {
  if (!scope) return false;
  return scope.length === 1 && scope[0] === 'secret-backend';
}

export async function runInitWizard(options: RunInitWizardOptions): Promise<InitWizardResult> {
  const config = options.baseConfig ?? defaultConfig();
  const scope = new Set<InitWizardScope>(
    options.scope ?? ['modules', 'provider', 'security', 'slack', 'discord', 'telegram', 'whatsapp'],
  );
  const secretBackendOnly = isSecretBackendOnlyScope(options.scope);

  let enableChat = moduleDefault(options.initialState, config, 'chat');
  let enableDashboard = moduleDefault(options.initialState, config, 'dashboard');
  let enableComms = hasEnabledScopedTransport(config, options.scope)
    ? true
    : moduleDefault(options.initialState, config, 'comms');
  if (!secretBackendOnly && scope.has('modules')) {
    enableChat = await askBoolean(options.io, 'Enable Chat? [Y/n]', enableChat);
    enableDashboard = await askBoolean(options.io, 'Enable Dashboard? [Y/n]', enableDashboard);
    enableComms = await askBoolean(options.io, 'Enable Comms? [y/N]', enableComms);
  }
  const selectedModules: Array<'chat' | 'dashboard' | 'comms'> = [];
  if (enableChat) selectedModules.push('chat');
  if (enableDashboard) selectedModules.push('dashboard');
  if (enableComms) selectedModules.push('comms');

  const currentProviderDefault = String(stateValue(options.initialState, 'providers.default') ?? config.providers.default);
  const providerDefault = (!secretBackendOnly && scope.has('provider'))
    ? await askText(options.io, `Default provider [${currentProviderDefault}]`, currentProviderDefault)
    : currentProviderDefault;

  const securityMode = (!secretBackendOnly && scope.has('security'))
    ? await askSecurityMode(options.io, options.initialState.securityMode)
    : options.initialState.securityMode;

  // Secret backend detection
  const completedSteps = new Set(options.initialState.completedSteps);
  if (options.secretStore) {
    let detection: { available: boolean; reason?: string | undefined; setupInstructions?: string | undefined };
    try {
      detection = await options.secretStore.detect();
    } catch (err) {
      detection = {
        available: false,
        reason: err instanceof Error ? err.message : 'detection failed',
      };
    }
    if (detection.available) {
      options.io.display(`Secret backend '${options.secretStore.id}' is available.`);
    } else {
      options.io.display(`Secret backend '${options.secretStore.id}' is not available: ${detection.reason ?? 'unknown reason'}`);
      if (detection.setupInstructions) {
        options.io.display(detection.setupInstructions);
      }
    }
    completedSteps.add('secret-backend-selection');
  }

  // If running in secret-backend-only mode, skip all comms and operator token prompts.
  // Preserve existing module/transport state from initialState if present, otherwise
  // derive from baseConfig so we don't accidentally disable modules that config has enabled.
  if (secretBackendOnly) {
    const preservedModules = options.initialState.selectedModules.length > 0
      ? options.initialState.selectedModules
      : selectedModules;
    const preservedTransports = options.initialState.selectedCommsTransports.length > 0
      ? options.initialState.selectedCommsTransports
      : options.initialState.selectedCommsTransports;
    const nextState: InitState = {
      ...options.initialState,
      selectedModules: preservedModules,
      selectedCommsTransports: preservedTransports,
      completedSteps: Array.from(completedSteps),
      securityMode,
      answers: { ...options.initialState.answers },
    };
    return { config: buildConfig(config, nextState, {
      allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
    }), state: nextState };
  }

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
      const activeScope = options.scope;
      const activeTransportScope = activeScope !== undefined
        && !activeScope.includes('modules')
        && !activeScope.includes('provider')
        && !activeScope.includes('security')
        ? activeScope
        : undefined;
      if (activeTransportScope && !activeTransportScope.includes(transport.id)) {
        continue;
      }
      const targetedTransportOnly = activeTransportScope !== undefined && activeTransportScope.includes(transport.id);
      const enabled = targetedTransportOnly
        ? config.comms[transport.id].enabled
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

        if (options.secretStore) {
          // Prompt for raw value and store it
          const rawBotToken = await askText(options.io, 'Enter your Slack bot token:', '');
          if (rawBotToken.length > 0) {
            await options.secretStore.store('comms.slack.botTokenRef', rawBotToken);
            answers['comms.slack.botTokenRef'] = 'comms.slack.botTokenRef';
          }
          const rawSigningSecret = await askText(options.io, 'Enter your Slack signing secret:', '');
          if (rawSigningSecret.length > 0) {
            await options.secretStore.store('comms.slack.signingSecretRef', rawSigningSecret);
            answers['comms.slack.signingSecretRef'] = 'comms.slack.signingSecretRef';
          }
        } else {
          const currentBotTokenRef = String(stateValue(options.initialState, 'comms.slack.botTokenRef') ?? '');
          if (!scope.has('slack') || currentBotTokenRef.length === 0) {
            answers['comms.slack.botTokenRef'] = await askText(options.io, 'Slack bot token ref', currentBotTokenRef);
          }
          const currentSigningSecretRef = String(stateValue(options.initialState, 'comms.slack.signingSecretRef') ?? '');
          if (!scope.has('slack') || currentSigningSecretRef.length === 0) {
            answers['comms.slack.signingSecretRef'] = await askText(options.io, 'Slack signing secret ref', currentSigningSecretRef);
          }
        }
      }

      if (transport.id === 'discord') {
        const currentApplicationId = String(stateValue(options.initialState, 'comms.discord.applicationId') ?? '');
        if (!scope.has('discord') || currentApplicationId.length === 0) {
          answers['comms.discord.applicationId'] = await askText(options.io, 'Discord application ID', currentApplicationId);
        }

        if (options.secretStore) {
          // Prompt for raw value and store it
          const rawBotToken = await askText(options.io, 'Enter your Discord bot token:', '');
          if (rawBotToken.length > 0) {
            await options.secretStore.store('comms.discord.botTokenRef', rawBotToken);
            answers['comms.discord.botTokenRef'] = 'comms.discord.botTokenRef';
          }
          // publicKeyRef is NOT sensitive (it's a public key) — prompt but don't store in secret backend
          const rawPublicKey = await askText(options.io, 'Enter your Discord public key:', '');
          if (rawPublicKey.length > 0) {
            answers['comms.discord.publicKeyRef'] = rawPublicKey;
          }
        } else {
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

      if (transport.id === 'telegram') {
        if (options.secretStore) {
          const rawBotToken = await askText(options.io, 'Enter your Telegram bot token:', '');
          if (rawBotToken.length > 0) {
            await options.secretStore.store('comms.telegram.botTokenRef', rawBotToken);
            answers['comms.telegram.botTokenRef'] = 'comms.telegram.botTokenRef';
          }
          const rawWebhookSecretToken = await askText(options.io, 'Enter your Telegram webhook secret token:', '');
          if (rawWebhookSecretToken.length > 0) {
            await options.secretStore.store('comms.telegram.webhookSecretTokenRef', rawWebhookSecretToken);
            answers['comms.telegram.webhookSecretTokenRef'] = 'comms.telegram.webhookSecretTokenRef';
          }
        } else {
          const currentBotTokenRef = String(
            stateValue(options.initialState, 'comms.telegram.botTokenRef')
              ?? config.comms.telegram.botTokenRef
              ?? '',
          );
          if (!scope.has('telegram') || currentBotTokenRef.length === 0) {
            answers['comms.telegram.botTokenRef'] = await askText(options.io, 'Telegram bot token ref', currentBotTokenRef);
          } else {
            answers['comms.telegram.botTokenRef'] = currentBotTokenRef;
          }
          const currentWebhookSecretTokenRef = String(
            stateValue(options.initialState, 'comms.telegram.webhookSecretTokenRef')
              ?? config.comms.telegram.webhookSecretTokenRef
              ?? '',
          );
          if (!scope.has('telegram') || currentWebhookSecretTokenRef.length === 0) {
            answers['comms.telegram.webhookSecretTokenRef'] = await askText(options.io, 'Telegram webhook secret token ref', currentWebhookSecretTokenRef);
          } else {
            answers['comms.telegram.webhookSecretTokenRef'] = currentWebhookSecretTokenRef;
          }
        }
      }

      if (transport.id === 'whatsapp') {
        if (options.secretStore) {
          const rawAccessToken = await askText(options.io, 'Enter your WhatsApp access token:', '');
          if (rawAccessToken.length > 0) {
            await options.secretStore.store('comms.whatsapp.accessTokenRef', rawAccessToken);
            answers['comms.whatsapp.accessTokenRef'] = 'comms.whatsapp.accessTokenRef';
          }
          const rawPhoneNumberId = await askText(options.io, 'Enter your WhatsApp phone number ID:', '');
          if (rawPhoneNumberId.length > 0) {
            answers['comms.whatsapp.phoneNumberIdRef'] = rawPhoneNumberId;
          }
          const rawAppSecret = await askText(options.io, 'Enter your WhatsApp app secret:', '');
          if (rawAppSecret.length > 0) {
            await options.secretStore.store('comms.whatsapp.appSecretRef', rawAppSecret);
            answers['comms.whatsapp.appSecretRef'] = 'comms.whatsapp.appSecretRef';
          }
          const rawVerifyToken = await askText(options.io, 'Enter your WhatsApp verify token:', '');
          if (rawVerifyToken.length > 0) {
            await options.secretStore.store('comms.whatsapp.verifyTokenRef', rawVerifyToken);
            answers['comms.whatsapp.verifyTokenRef'] = 'comms.whatsapp.verifyTokenRef';
          }
        } else {
          const currentAccessTokenRef = String(
            stateValue(options.initialState, 'comms.whatsapp.accessTokenRef')
              ?? config.comms.whatsapp.accessTokenRef
              ?? '',
          );
          if (!scope.has('whatsapp') || currentAccessTokenRef.length === 0) {
            answers['comms.whatsapp.accessTokenRef'] = await askText(options.io, 'WhatsApp access token ref', currentAccessTokenRef);
          } else {
            answers['comms.whatsapp.accessTokenRef'] = currentAccessTokenRef;
          }
          const currentPhoneNumberIdRef = String(
            stateValue(options.initialState, 'comms.whatsapp.phoneNumberIdRef')
              ?? config.comms.whatsapp.phoneNumberIdRef
              ?? '',
          );
          if (!scope.has('whatsapp') || currentPhoneNumberIdRef.length === 0) {
            answers['comms.whatsapp.phoneNumberIdRef'] = await askText(options.io, 'WhatsApp phone number ID ref', currentPhoneNumberIdRef);
          } else {
            answers['comms.whatsapp.phoneNumberIdRef'] = currentPhoneNumberIdRef;
          }
          const currentAppSecretRef = String(
            stateValue(options.initialState, 'comms.whatsapp.appSecretRef')
              ?? config.comms.whatsapp.appSecretRef
              ?? '',
          );
          if (!scope.has('whatsapp') || currentAppSecretRef.length === 0) {
            answers['comms.whatsapp.appSecretRef'] = await askText(options.io, 'WhatsApp app secret ref', currentAppSecretRef);
          } else {
            answers['comms.whatsapp.appSecretRef'] = currentAppSecretRef;
          }
          const currentVerifyTokenRef = String(
            stateValue(options.initialState, 'comms.whatsapp.verifyTokenRef')
              ?? config.comms.whatsapp.verifyTokenRef
              ?? '',
          );
          if (!scope.has('whatsapp') || currentVerifyTokenRef.length === 0) {
            answers['comms.whatsapp.verifyTokenRef'] = await askText(options.io, 'WhatsApp verify token ref', currentVerifyTokenRef);
          } else {
            answers['comms.whatsapp.verifyTokenRef'] = currentVerifyTokenRef;
          }
        }
      }
    }
  }

  // Operator token handling (only when secretStore is provided)
  if (options.secretStore) {
    const rawToken = await askText(options.io, 'Enter operator token (leave blank to auto-generate):', '');
    const operatorToken = rawToken.length > 0
      ? rawToken
      : randomBytes(32).toString('hex');
    if (rawToken.length === 0) {
      options.io.display(`Auto-generated operator token: ${operatorToken}`);
    }
    await options.secretStore.store('network.operatorTokenRef', operatorToken);
    answers['network.operatorTokenRef'] = 'network.operatorTokenRef';
  }

  completedSteps.add('module-selection');
  completedSteps.add('provider-config');
  completedSteps.add('security-selection');
  if (enableComms) {
    completedSteps.add('comms-transport-selection');
  }

  const nextState: InitState = {
    ...options.initialState,
    selectedModules,
    selectedCommsTransports,
    completedSteps: Array.from(completedSteps),
    securityMode,
    answers,
  };

  return {
    config: buildConfig(config, nextState, {
      allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
    }),
    state: nextState,
  };
}
