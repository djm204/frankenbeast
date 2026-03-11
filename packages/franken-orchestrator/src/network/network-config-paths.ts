const NETWORK_CONFIG_PATH_DEFINITIONS = {
  'network.mode': { type: 'enum', values: ['secure', 'insecure'] },
  'network.secureBackend': {
    type: 'enum',
    values: ['1password', 'bitwarden', 'os-keychain', 'local-encrypted'],
  },
  'network.operatorTokenRef': { type: 'string', sensitive: true },
  'chat.enabled': { type: 'boolean' },
  'chat.host': { type: 'string' },
  'chat.port': { type: 'number' },
  'chat.model': { type: 'string' },
  'dashboard.enabled': { type: 'boolean' },
  'dashboard.host': { type: 'string' },
  'dashboard.port': { type: 'number' },
  'dashboard.apiUrl': { type: 'string' },
  'comms.enabled': { type: 'boolean' },
  'comms.host': { type: 'string' },
  'comms.port': { type: 'number' },
  'comms.orchestratorWsUrl': { type: 'string' },
  'comms.orchestratorTokenRef': { type: 'string', sensitive: true },
  'comms.slack.enabled': { type: 'boolean' },
  'comms.slack.appId': { type: 'string' },
  'comms.slack.botTokenRef': { type: 'string', sensitive: true },
  'comms.slack.signingSecretRef': { type: 'string', sensitive: true },
  'comms.discord.enabled': { type: 'boolean' },
  'comms.discord.applicationId': { type: 'string' },
  'comms.discord.botTokenRef': { type: 'string', sensitive: true },
  'comms.discord.publicKeyRef': { type: 'string' },
} as const;

type ConfigValueType = 'boolean' | 'number' | 'string' | 'enum';
type ConfigPathDefinition = {
  type: ConfigValueType;
  values?: readonly string[];
  sensitive?: boolean;
};

export type NetworkConfigPath = keyof typeof NETWORK_CONFIG_PATH_DEFINITIONS;

function getPathDefinition(path: string): ConfigPathDefinition {
  const definition = NETWORK_CONFIG_PATH_DEFINITIONS[path as NetworkConfigPath];
  if (!definition) {
    throw new Error(`Unknown network config path: ${path}`);
  }
  return definition;
}

export function parseConfigAssignment(assignment: string): { path: string; rawValue: string } {
  const separatorIndex = assignment.indexOf('=');
  if (separatorIndex <= 0) {
    throw new Error(`Invalid config assignment: ${assignment}`);
  }

  return {
    path: assignment.slice(0, separatorIndex),
    rawValue: assignment.slice(separatorIndex + 1),
  };
}

export function isSensitiveConfigPath(path: string): boolean {
  return getPathDefinition(path).sensitive ?? false;
}

export function coerceNetworkConfigValue(path: string, rawValue: string): boolean | number | string {
  const definition = getPathDefinition(path);

  switch (definition.type) {
    case 'boolean':
      if (rawValue === 'true') return true;
      if (rawValue === 'false') return false;
      throw new Error(`Expected boolean for ${path}, received: ${rawValue}`);
    case 'number': {
      const parsed = Number(rawValue);
      if (!Number.isFinite(parsed)) {
        throw new Error(`Expected number for ${path}, received: ${rawValue}`);
      }
      return parsed;
    }
    case 'enum':
      if (!definition.values?.includes(rawValue)) {
        throw new Error(`Invalid value for ${path}: ${rawValue}`);
      }
      return rawValue;
    case 'string':
      return rawValue;
    default:
      throw new Error(`Unsupported config type for ${path}`);
  }
}

function cloneWithSet<T extends object>(source: T, segments: string[], value: unknown): T {
  const root: Record<string, unknown> = { ...(source as Record<string, unknown>) };
  let cursor: Record<string, unknown> = root;
  let sourceCursor: Record<string, unknown> | undefined = source as Record<string, unknown>;

  for (let index = 0; index < segments.length - 1; index += 1) {
    const segment = segments[index]!;
    const sourceValue: unknown = sourceCursor?.[segment];
    const next =
      sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
        ? { ...(sourceValue as Record<string, unknown>) }
        : {};
    cursor[segment] = next;
    cursor = next;
    sourceCursor =
      sourceValue !== null && typeof sourceValue === 'object' && !Array.isArray(sourceValue)
        ? (sourceValue as Record<string, unknown>)
        : undefined;
  }

  cursor[segments[segments.length - 1]!] = value;
  return root as T;
}

export function setNetworkConfigValue<T extends object>(config: T, path: string, rawValue: string): T {
  getPathDefinition(path);
  const coerced = coerceNetworkConfigValue(path, rawValue);
  return cloneWithSet(config, path.split('.'), coerced);
}

export function getNetworkConfigValue(config: unknown, path: string): unknown {
  getPathDefinition(path);
  return path
    .split('.')
    .reduce<unknown>((current, segment) => {
      if (current === null || typeof current !== 'object') {
        return undefined;
      }
      return (current as Record<string, unknown>)[segment];
    }, config);
}

export function applyNetworkConfigSets<T extends object>(config: T, assignments: string[]): T {
  return assignments.reduce((currentConfig, assignment) => {
    const { path, rawValue } = parseConfigAssignment(assignment);
    return setNetworkConfigValue(currentConfig, path, rawValue);
  }, config);
}
