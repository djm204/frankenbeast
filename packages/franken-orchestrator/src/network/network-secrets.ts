import type { OrchestratorConfig } from '../config/orchestrator-config.js';
import { setNetworkConfigValue, isSensitiveConfigPath } from './network-config-paths.js';

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
  {
    id: '1password',
    displayName: '1Password',
    recommended: true,
  },
  {
    id: 'bitwarden',
    displayName: 'Bitwarden',
    recommended: true,
  },
  {
    id: 'os-keychain',
    displayName: 'OS Keychain',
    recommended: true,
  },
  {
    id: 'local-encrypted',
    displayName: 'Local Encrypted Store',
    recommended: false,
    warning: 'Local encrypted storage is not the optimal solution for production use.',
  },
];

const SENSITIVE_CONFIG_PATHS = [
  'network.operatorTokenRef',
  'comms.orchestratorTokenRef',
  'comms.slack.botTokenRef',
  'comms.slack.signingSecretRef',
  'comms.discord.botTokenRef',
] as const;

export function resolveSecretMode(config: OrchestratorConfig): 'secure' | 'insecure' {
  return config.network.mode;
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
    detected.push(CATALOG[0]!); // 1password
  }
  if (await options.commandExists('bw')) {
    detected.push(CATALOG[1]!); // bitwarden
  }
  if (await options.osStoreAvailable()) {
    detected.push(CATALOG[2]!); // os-keychain
  }

  detected.push(CATALOG[3]!); // local-encrypted
  return detected;
}
