import type { OrchestratorConfig } from '../config/orchestrator-config.js';

export type CredentialInventoryStatus = 'configured' | 'missing' | 'inactive-configured' | 'inactive-missing' | 'optional-configured' | 'optional-missing';

export interface CredentialInventoryEntry {
  readonly scope: string;
  readonly configPath: string;
  readonly ref: string | null;
  readonly status: CredentialInventoryStatus;
}

export interface CredentialInventoryReport {
  readonly mode: OrchestratorConfig['network']['mode'];
  readonly secureBackend: OrchestratorConfig['network']['secureBackend'];
  readonly credentials: CredentialInventoryEntry[];
  readonly guidance: string;
}

function credentialStatus(ref: string | undefined, active: boolean, required = true): CredentialInventoryStatus {
  if (!required) return ref ? 'optional-configured' : 'optional-missing';
  if (active) return ref ? 'configured' : 'missing';
  return ref ? 'inactive-configured' : 'inactive-missing';
}

function entry(scope: string, configPath: string, ref: string | undefined, active: boolean, required = true): CredentialInventoryEntry {
  return {
    scope,
    configPath,
    ref: ref ?? null,
    status: credentialStatus(ref, active, required),
  };
}

export function buildCredentialInventoryReport(config: OrchestratorConfig): CredentialInventoryReport {
  const commsActive = config.comms.enabled
    || config.comms.slack.enabled
    || config.comms.discord.enabled
    || config.comms.telegram.enabled
    || config.comms.whatsapp.enabled;

  return {
    mode: config.network.mode,
    secureBackend: config.network.secureBackend,
    credentials: [
      entry('network.operator', 'network.operatorTokenRef', config.network.operatorTokenRef, true),
      entry('comms.orchestrator', 'comms.orchestratorTokenRef', config.comms.orchestratorTokenRef, commsActive, false),
      entry('comms.slack.bot', 'comms.slack.botTokenRef', config.comms.slack.botTokenRef, config.comms.slack.enabled),
      entry('comms.slack.signing', 'comms.slack.signingSecretRef', config.comms.slack.signingSecretRef, config.comms.slack.enabled),
      entry('comms.discord', 'comms.discord.botTokenRef', config.comms.discord.botTokenRef, config.comms.discord.enabled),
      entry('comms.telegram', 'comms.telegram.botTokenRef', config.comms.telegram.botTokenRef, config.comms.telegram.enabled),
      entry('comms.telegram.webhook', 'comms.telegram.webhookSecretTokenRef', config.comms.telegram.webhookSecretTokenRef, config.comms.telegram.enabled),
      entry('comms.whatsapp.access', 'comms.whatsapp.accessTokenRef', config.comms.whatsapp.accessTokenRef, config.comms.whatsapp.enabled),
      entry('comms.whatsapp.app', 'comms.whatsapp.appSecretRef', config.comms.whatsapp.appSecretRef, config.comms.whatsapp.enabled),
      entry('comms.whatsapp.verify', 'comms.whatsapp.verifyTokenRef', config.comms.whatsapp.verifyTokenRef, config.comms.whatsapp.enabled),
    ],
    guidance: 'Inventory reports secret-store reference names only; resolve values through the configured secure backend and never paste credential values into logs, issues, PRs, prompts, or telemetry. Treat missing required entries as setup gaps before exposing services; optional-missing entries are informational.',
  };
}
