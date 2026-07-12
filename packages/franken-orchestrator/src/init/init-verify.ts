import { parseOrchestratorConfig, type OrchestratorConfig } from '../config/orchestrator-config.js';
import { isInitStateForConfig, type FileInitStateStore } from './init-state-store.js';
import type { ISecretStore } from '../network/secret-store.js';
import { readJsonFileOrDefault, warnJsonQuarantined } from './init-json-file.js';

export type InitIssueCode =
  | 'missing-config'
  | 'missing-init-state'
  | 'invalid-config-json'
  | 'invalid-init-state-json'
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

type JsonReadResult<T> =
  | { status: 'ok'; value: T }
  | { status: 'missing' }
  | { status: 'invalid'; message: string };

const missingJson = Symbol('missing-json');

function describeJsonParseError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return `Invalid JSON: ${error.message}`;
  }
  return 'Invalid JSON syntax.';
}

function isJsonObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

async function tryReadJson<T>(filePath: string): Promise<JsonReadResult<T>> {
  let corruptMessage: string | undefined;
  const value = await readJsonFileOrDefault<T | typeof missingJson>(filePath, () => missingJson, {
    description: 'init verification JSON',
    onCorrupt: (recovery) => {
      corruptMessage = describeJsonParseError(recovery.error);
      warnJsonQuarantined(recovery);
    },
  });
  if (corruptMessage) {
    return { status: 'invalid', message: corruptMessage };
  }
  if (value === missingJson) {
    return { status: 'missing' };
  }
  return { status: 'ok', value };
}

export async function verifyInit(options: {
  configFile: string;
  stateStore: FileInitStateStore;
  secretStore?: ISecretStore | undefined;
  allowTrustedProviderCommandOverrides?: boolean | undefined;
}): Promise<InitVerificationResult> {
  const issues: InitVerificationIssue[] = [];
  const configRead = await tryReadJson<unknown>(options.configFile);
  const stateRead = await tryReadJson<unknown>(options.stateStore.filePath);
  const rawConfig = configRead.status === 'ok' && isJsonObject(configRead.value) ? configRead.value : undefined;

  if (configRead.status === 'missing') {
    issues.push({
      code: 'missing-config',
      message: `Config file is missing at ${options.configFile}. Run frankenbeast init.`,
    });
  } else if (configRead.status === 'invalid') {
    issues.push({
      code: 'invalid-config-json',
      message: `Config file at ${options.configFile} could not be parsed. ${configRead.message}`,
    });
  } else if (!isJsonObject(configRead.value)) {
    issues.push({
      code: 'invalid-config-json',
      message: `Config file at ${options.configFile} must contain a JSON object.`,
    });
  }

  if (stateRead.status === 'missing') {
    issues.push({
      code: 'missing-init-state',
      message: `Init state is missing at ${options.stateStore.filePath}. Run frankenbeast init.`,
    });
  } else if (stateRead.status === 'invalid') {
    issues.push({
      code: 'invalid-init-state-json',
      message: `Init state at ${options.stateStore.filePath} could not be parsed. ${stateRead.message}`,
    });
  } else if (!isJsonObject(stateRead.value)) {
    issues.push({
      code: 'invalid-init-state-json',
      message: `Init state at ${options.stateStore.filePath} must contain a JSON object.`,
    });
  } else if (!isInitStateForConfig(stateRead.value, options.configFile, options.stateStore.filePath)) {
    issues.push({
      code: 'invalid-init-state-json',
      message: `Init state at ${options.stateStore.filePath} must contain a complete init state for ${options.configFile}.`,
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
