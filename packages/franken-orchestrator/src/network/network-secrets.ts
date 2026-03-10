import { createHash } from 'node:crypto';
import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { setNetworkConfigValue, isSensitiveConfigPath } from './network-config-paths.js';
import { bitwardenBackend } from './secret-backends/bitwarden.js';
import { localEncryptedStoreBackend } from './secret-backends/local-encrypted-store.js';
import { onePasswordBackend } from './secret-backends/one-password.js';
import { osStoreBackend } from './secret-backends/os-store.js';

export interface SecretBackend {
  id: string;
  displayName: string;
  recommended: boolean;
  warning?: string | undefined;
}

export interface SecretBackendDetectionOptions {
  commandExists: (command: string) => Promise<boolean>;
  osStoreAvailable: () => Promise<boolean>;
}

const CATALOG: SecretBackend[] = [
  onePasswordBackend,
  bitwardenBackend,
  osStoreBackend,
  localEncryptedStoreBackend,
];

const SENSITIVE_CONFIG_PATHS = [
  'comms.orchestratorTokenRef',
  'comms.slack.botTokenRef',
  'comms.slack.signingSecretRef',
  'comms.discord.botTokenRef',
] as const;

export function resolveSecretMode(config: OrchestratorConfig): 'secure' | 'insecure' {
  return config.network.mode;
}

export function createSecretRef(options: {
  path: string;
  rawValue: string;
  mode: 'secure' | 'insecure';
}): string {
  const digest = createHash('sha256')
    .update(`${options.path}:${options.rawValue}`)
    .digest('hex')
    .slice(0, 12);
  return `secret://${options.mode}/${options.path}/${digest}`;
}

export function redactSensitiveConfig(config: OrchestratorConfig): OrchestratorConfig {
  let redacted = structuredClone(config);
  for (const path of SENSITIVE_CONFIG_PATHS) {
    const value = path
      .split('.')
      .reduce<unknown>((current, segment) => {
        if (current === null || typeof current !== 'object') {
          return undefined;
        }
        return (current as Record<string, unknown>)[segment];
      }, redacted);

    if (typeof value === 'string' && isSensitiveConfigPath(path)) {
      redacted = setNetworkConfigValue(redacted, path, '[redacted]');
    }
  }
  return redacted;
}

export function getSecretBackendCatalog(): SecretBackend[] {
  return [...CATALOG];
}

export async function detectAvailableSecretBackends(
  options: SecretBackendDetectionOptions,
): Promise<SecretBackend[]> {
  const detected: SecretBackend[] = [];

  if (await options.commandExists('op')) {
    detected.push(onePasswordBackend);
  }
  if (await options.commandExists('bw')) {
    detected.push(bitwardenBackend);
  }
  if (await options.osStoreAvailable()) {
    detected.push(osStoreBackend);
  }

  detected.push(localEncryptedStoreBackend);
  return detected;
}
