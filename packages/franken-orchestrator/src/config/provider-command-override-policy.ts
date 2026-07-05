import { basename, isAbsolute, normalize, parse, sep } from 'node:path';

export interface ProviderCommandOverridePolicyConfig {
  readonly command?: string | undefined;
  readonly cliPath?: string | undefined;
  readonly trustCommandOverride?: boolean | undefined;
  readonly trustedCommandPaths?: readonly string[] | undefined;
}

export interface ProviderCommandOverrideAuditLogger {
  warn(message: string, component?: string): void;
}

const BUILTIN_PROVIDER_COMMANDS: Record<string, readonly string[]> = {
  claude: ['claude', 'claude-code'],
  codex: ['codex'],
  gemini: ['gemini', 'gemini-cli'],
  aider: ['aider'],
};

function providerNameForType(provider: string): string {
  return provider.endsWith('-cli') ? provider.slice(0, -'-cli'.length) : provider;
}

function allowedCommandNames(provider: string): readonly string[] {
  return BUILTIN_PROVIDER_COMMANDS[providerNameForType(provider)] ?? [providerNameForType(provider)];
}

function isTrustedPath(command: string, trustedPaths: readonly string[] | undefined): boolean {
  if (!isAbsolute(command) || !trustedPaths?.length) {
    return false;
  }

  const normalizedCommand = normalize(command);
  return trustedPaths.some((entry) => {
    if (!isAbsolute(entry)) return false;
    const normalizedEntry = normalizeTrustedDirectory(entry);
    return normalizedCommand === normalizedEntry || normalizedCommand.startsWith(`${normalizedEntry}${sep}`);
  });
}

function normalizeTrustedDirectory(entry: string): string {
  const normalized = normalize(entry);
  const root = parse(normalized).root;
  let trimmed = normalized;
  while (trimmed.length > root.length && trimmed.endsWith(sep)) {
    trimmed = trimmed.slice(0, -sep.length);
  }
  return trimmed;
}

export function validateProviderCommandOverride(
  provider: string,
  override: ProviderCommandOverridePolicyConfig,
): string[] {
  const command = override.command ?? override.cliPath;
  if (!command) {
    return [];
  }

  const issues: string[] = [];
  if (override.trustCommandOverride !== true) {
    issues.push(
      `provider command override for ${provider} requires trustCommandOverride: true before a repo-configured command override may be used`,
    );
  }

  const commandIsBareName = command === basename(command);
  const allowed = allowedCommandNames(provider);
  if (!(commandIsBareName && allowed.includes(command)) && !isTrustedPath(command, override.trustedCommandPaths)) {
    issues.push(
      `provider command override for ${provider} must be a bare allowed provider binary `
        + `(${allowed.join(', ')}) or an absolute path under trustedCommandPaths`,
    );
  }

  return issues;
}

export function assertTrustedProviderCommandOverrides(
  overrides: Record<string, ProviderCommandOverridePolicyConfig> | undefined,
  options?: { readonly logger?: ProviderCommandOverrideAuditLogger | undefined },
): void {
  if (!overrides) return;

  assertTrustedProviderCommandOverrideEntries(Object.entries(overrides), options);
}

export function assertTrustedProviderCommandOverrideEntries(
  overrides: Iterable<readonly [string, ProviderCommandOverridePolicyConfig]>,
  options?: { readonly logger?: ProviderCommandOverrideAuditLogger | undefined },
): void {
  const entries = Array.from(overrides);
  if (entries.length === 0) return;

  const issues: string[] = [];
  for (const [provider, override] of entries) {
    issues.push(...validateProviderCommandOverride(provider, override));
    const command = override.command ?? override.cliPath;
    if (command && override.trustCommandOverride === true) {
      options?.logger?.warn(
        `SECURITY AUDIT: using trusted provider command override for ${provider}: ${command}`,
        'provider-command-policy',
      );
    }
  }

  if (issues.length > 0) {
    throw new Error(`Refusing unsafe provider command override: ${issues.join('; ')}`);
  }
}
