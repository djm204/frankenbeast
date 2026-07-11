import { parseOrchestratorConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import type { FileInitStateStore } from './init-state-store.js';
import type { ISecretStore } from '../network/secret-store.js';
import { readJsonFileOrDefault, warnJsonQuarantined } from './init-json-file.js';

export type InitIssueCode =
  | 'missing-config'
  | 'missing-init-state'
  | 'slack-incomplete'
  | 'discord-incomplete'
  | 'telegram-incomplete'
  | 'whatsapp-incomplete'
  | 'secret-backend-unavailable';

export interface InitVerificationIssue {
  code: InitIssueCode;
  message: string;
}

export interface InitVerificationResult {
  ok: boolean;
  issues: InitVerificationIssue[];
  messages: string[];
  config?: OrchestratorConfig;
}

async function tryReadJson<T>(filePath: string): Promise<T | undefined> {
  return readJsonFileOrDefault<T | undefined>(filePath, () => undefined, {
    description: 'init verification JSON',
    onCorrupt: warnJsonQuarantined,
  });
}

export async function verifyInit(options: {
  configFile: string;
  stateStore: FileInitStateStore;
  secretStore?: ISecretStore | undefined;
  allowTrustedProviderCommandOverrides?: boolean | undefined;
}): Promise<InitVerificationResult> {
  const issues: InitVerificationIssue[] = [];
  const rawConfig = await tryReadJson<unknown>(options.configFile);
  const rawState = await tryReadJson<unknown>(options.stateStore.filePath);

  if (!rawConfig) {
    issues.push({
      code: 'missing-config',
      message: `Config file is missing at ${options.configFile}. Run frankenbeast init.`,
    });
  }

  if (!rawState) {
    issues.push({
      code: 'missing-init-state',
      message: `Init state is missing at ${options.stateStore.filePath}. Run frankenbeast init.`,
    });
  }

  if (!rawConfig) {
    return {
      ok: false,
      issues,
      messages: issues.map((issue) => issue.message),
    };
  }

  const config = parseOrchestratorConfig(rawConfig, {
    allowTrustedProviderCommandOverrides: options.allowTrustedProviderCommandOverrides,
  });

  if (config.comms.slack.enabled) {
    const missing: string[] = [];
    if (!config.comms.slack.appId) missing.push('appId');
    if (!config.comms.slack.botTokenRef) missing.push('botTokenRef');
    if (!config.comms.slack.signingSecretRef) missing.push('signingSecretRef');
    if (missing.length > 0) {
      issues.push({
        code: 'slack-incomplete',
        message: `Slack config is incomplete: missing ${missing.join(', ')}.`,
      });
    }
  }

  if (config.comms.discord.enabled) {
    const missing: string[] = [];
    if (!config.comms.discord.applicationId) missing.push('applicationId');
    if (!config.comms.discord.botTokenRef) missing.push('botTokenRef');
    if (!config.comms.discord.publicKeyRef) missing.push('publicKeyRef');
    if (missing.length > 0) {
      issues.push({
        code: 'discord-incomplete',
        message: `Discord config is incomplete: missing ${missing.join(', ')}.`,
      });
    }
  }

  if (config.comms.telegram.enabled) {
    const missing: string[] = [];
    if (!config.comms.telegram.botTokenRef) missing.push('botTokenRef');
    if (!config.comms.telegram.webhookSecretTokenRef) missing.push('webhookSecretTokenRef');
    if (missing.length > 0) {
      issues.push({
        code: 'telegram-incomplete',
        message: `Telegram config is incomplete: missing ${missing.join(', ')}.`,
      });
    }
  }

  if (config.comms.whatsapp.enabled) {
    const missing: string[] = [];
    if (!config.comms.whatsapp.accessTokenRef) missing.push('accessTokenRef');
    if (!config.comms.whatsapp.phoneNumberIdRef) missing.push('phoneNumberIdRef');
    if (!config.comms.whatsapp.appSecretRef) missing.push('appSecretRef');
    if (!config.comms.whatsapp.verifyTokenRef) missing.push('verifyTokenRef');
    if (missing.length > 0) {
      issues.push({
        code: 'whatsapp-incomplete',
        message: `WhatsApp config is incomplete: missing ${missing.join(', ')}.`,
      });
    }
  }

  if (options.secretStore) {
    const detection = await options.secretStore.detect();
    if (!detection.available) {
      issues.push({
        code: 'secret-backend-unavailable',
        message: `Secret backend '${options.secretStore.id}' is not available: ${detection.reason ?? 'unknown reason'}`,
      });
    }
  }

  return {
    ok: issues.length === 0,
    issues,
    messages: issues.map((issue) => issue.message),
    config,
  };
}
