import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createSqliteStore } from '../shared/sqlite-store.js';
import { PATTERNS_ALL_TIERS, PATTERNS_STRICT_ONLY } from '@franken/orchestrator';
import type { InjectionTier } from '@franken/orchestrator';

export interface FirewallScanResult {
  verdict: 'clean' | 'flagged';
  matchedPatterns: string[];
}

export interface FirewallAdapter {
  scanText(input: string): Promise<FirewallScanResult>;
  scanFile(path: string): Promise<FirewallScanResult>;
}

interface FirewallAdapterDeps {
  scanText(input: string): Promise<FirewallScanResult>;
  scanFile(path: string): Promise<FirewallScanResult>;
}

interface FirewallAdapterOptions {
  root?: string | undefined;
  configPath?: string | undefined;
}

type SecurityProfile = 'strict' | 'standard' | 'permissive';

interface CustomFirewallRule {
  name: string;
  pattern: string;
  action: 'block' | 'warn' | 'log';
  target: 'request' | 'response' | 'both';
}

interface FirewallScanConfig {
  profile: SecurityProfile;
  injectionDetection: boolean;
  customRules: CustomFirewallRule[];
}

export function createFirewallAdapter(
  dbPathOrDeps: string | FirewallAdapterDeps,
  tier: InjectionTier = 'standard',
  options: FirewallAdapterOptions = {},
): FirewallAdapter {
  if (typeof dbPathOrDeps !== 'string') {
    return dbPathOrDeps;
  }

  const store = createSqliteStore(dbPathOrDeps);
  const root = realpathSync(resolve(options.root ?? process.env['FBEAST_ROOT'] ?? process.cwd()));
  const configPath = resolveConfigPath(
    options.configPath ?? process.env['FBEAST_CONFIG'] ?? join(dirname(dbPathOrDeps), 'config.json'),
    root,
  );

  function resolveContained(requested: string): string {
    const target = resolve(root, requested);
    const realTarget = realpathSync(target); // throws ENOENT for missing — acceptable, caller handles
    // relative() handles the filesystem-root case (root === sep) where a
    // naive `root + sep` prefix would become a double separator.
    const rel = relative(root, realTarget);
    if (rel !== '' && (rel === '..' || rel.startsWith('..' + sep) || isAbsolute(rel))) {
      throw new Error(`Refusing to scan path outside project root: ${requested}`);
    }
    return realTarget;
  }

  return {
    async scanText(input) {
      const result = scanWithConfig(input, loadFirewallScanConfig(configPath, tier));
      logScan(input, result);
      return result;
    },

    async scanFile(path) {
      const safePath = resolveContained(path);
      const content = readFileSync(safePath, 'utf8');
      const result = scanWithConfig(content, loadFirewallScanConfig(configPath, tier));
      logScan(content, result);
      return result;
    },
  };

  function logScan(input: string, result: FirewallScanResult): void {
    const inputHash = createHash('sha256').update(input).digest('hex').slice(0, 16);
    store.db.prepare(`
      INSERT INTO firewall_log (input_hash, verdict, matched_patterns)
      VALUES (?, ?, ?)
    `).run(inputHash, result.verdict, result.matchedPatterns.join(',') || null);
  }
}

function resolveConfigPath(configPath: string, root: string): string {
  return isAbsolute(configPath) ? configPath : resolve(root, configPath);
}

function loadFirewallScanConfig(configPath: string, fallbackTier: InjectionTier): FirewallScanConfig {
  const fallbackProfile: SecurityProfile = fallbackTier === 'strict' ? 'strict' : 'standard';
  if (!existsSync(configPath)) {
    return { profile: fallbackProfile, injectionDetection: true, customRules: [] };
  }

  const raw = readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw) as unknown;
  if (!isRecord(parsed)) {
    throw new Error(`Firewall config must contain a JSON object: ${configPath}`);
  }
  const security = parsed['security'];
  if (security === undefined) {
    return { profile: fallbackProfile, injectionDetection: true, customRules: [] };
  }
  if (!isRecord(security)) {
    throw new Error(`Firewall config security field must be an object: ${configPath}`);
  }
  const profile = parseSecurityProfile(security['profile'], fallbackProfile, configPath);
  return {
    profile,
    injectionDetection: parseOptionalBoolean(security['injectionDetection'], profile !== 'permissive', 'security.injectionDetection', configPath),
    customRules: parseCustomRules(security['customRules'], configPath),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSecurityProfile(value: unknown, fallback: SecurityProfile, configPath: string): SecurityProfile {
  if (value === undefined) return fallback;
  if (value === 'strict' || value === 'standard' || value === 'permissive') return value;
  throw new Error(`Invalid security.profile in firewall config: ${configPath}`);
}

function parseOptionalBoolean(value: unknown, fallback: boolean, field: string, configPath: string): boolean {
  if (value === undefined) return fallback;
  if (typeof value === 'boolean') return value;
  throw new Error(`Invalid ${field} in firewall config: ${configPath}`);
}

function parseCustomRules(value: unknown, configPath: string): CustomFirewallRule[] {
  if (value === undefined) return [];
  if (!Array.isArray(value)) {
    throw new Error(`Invalid security.customRules in firewall config: ${configPath}`);
  }
  return value.map((rule, index) => parseCustomRule(rule, index, configPath));
}

function parseCustomRule(rule: unknown, index: number, configPath: string): CustomFirewallRule {
  if (!isRecord(rule)) {
    throw new Error(`Invalid security.customRules[${index}] in firewall config: ${configPath}`);
  }
  const name = parseRequiredString(rule['name'], `security.customRules[${index}].name`, configPath);
  const pattern = parseRequiredString(rule['pattern'], `security.customRules[${index}].pattern`, configPath);
  const action = parseRuleAction(rule['action'], index, configPath);
  const target = parseRuleTarget(rule['target'], index, configPath);
  assertSafeCustomRulePattern(pattern, index, configPath);
  return { name, pattern, action, target };
}

function assertSafeCustomRulePattern(pattern: string, index: number, configPath: string): void {
  if (pattern.length > 256 || hasUnsafeQuantifiedGroup(pattern)) {
    throw new Error(`Unsafe security.customRules[${index}].pattern in firewall config: ${configPath}`);
  }
  try {
    new RegExp(pattern, 'i');
  } catch {
    throw new Error(`Invalid security.customRules[${index}].pattern in firewall config: ${configPath}`);
  }
}

function hasUnsafeQuantifiedGroup(pattern: string): boolean {
  const simpleGroup = String.raw`\((?:[^()\\]|\\.)*`;
  const groupEndWithOuterQuantifier = String.raw`(?:[^()\\]|\\.)*\)\s*[+*?{]`;
  return new RegExp(`${simpleGroup}[+*]${groupEndWithOuterQuantifier}`).test(pattern)
    || new RegExp(`${simpleGroup}\|${groupEndWithOuterQuantifier}`).test(pattern);
}

function parseRequiredString(value: unknown, field: string, configPath: string): string {
  if (typeof value === 'string' && value.length > 0) return value;
  throw new Error(`Invalid ${field} in firewall config: ${configPath}`);
}

function parseRuleAction(value: unknown, index: number, configPath: string): CustomFirewallRule['action'] {
  if (value === 'block' || value === 'warn' || value === 'log') return value;
  throw new Error(`Invalid security.customRules[${index}].action in firewall config: ${configPath}`);
}

function parseRuleTarget(value: unknown, index: number, configPath: string): CustomFirewallRule['target'] {
  if (value === 'request' || value === 'response' || value === 'both') return value;
  throw new Error(`Invalid security.customRules[${index}].target in firewall config: ${configPath}`);
}

function patternsForConfig(config: FirewallScanConfig): RegExp[] {
  if (!config.injectionDetection) return [];
  return config.profile === 'strict'
    ? [...PATTERNS_ALL_TIERS, ...PATTERNS_STRICT_ONLY]
    : PATTERNS_ALL_TIERS;
}

function customRequestBlockPatterns(config: FirewallScanConfig): Array<{ name: string; pattern: RegExp }> {
  return config.customRules
    .filter((rule) => rule.action === 'block' && rule.target !== 'response')
    .map((rule) => ({ name: rule.name, pattern: new RegExp(rule.pattern, 'i') }));
}

function scanWithConfig(input: string, config: FirewallScanConfig): FirewallScanResult {
  const builtInMatches = patternsForConfig(config)
    .filter((pattern) => pattern.test(input))
    .map((pattern) => pattern.source);
  const customMatches = customRequestBlockPatterns(config)
    .filter((rule) => rule.pattern.test(input))
    .map((rule) => `custom:${rule.name}`);

  const matchedPatterns = [...builtInMatches, ...customMatches];

  return {
    verdict: matchedPatterns.length > 0 ? 'flagged' : 'clean',
    matchedPatterns,
  };
}
