import { readFile } from 'node:fs/promises';
import { OrchestratorConfigSchema, type OrchestratorConfig } from '../config/orchestrator-config.js';
import type { FileInitStateStore } from './init-state-store.js';

export type InitIssueCode =
  | 'missing-config'
  | 'missing-init-state'
  | 'slack-incomplete'
  | 'discord-incomplete';

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
  try {
    const raw = await readFile(filePath, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

export async function verifyInit(options: {
  configFile: string;
  stateStore: FileInitStateStore;
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

  const config = OrchestratorConfigSchema.parse(rawConfig);

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

  return {
    ok: issues.length === 0,
    issues,
    messages: issues.map((issue) => issue.message),
    config,
  };
}
