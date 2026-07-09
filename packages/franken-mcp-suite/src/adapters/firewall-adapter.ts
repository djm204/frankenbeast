import { createHash } from 'node:crypto';
import { existsSync, readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, join, relative, resolve, sep } from 'node:path';
import { createSqliteStore } from '../shared/sqlite-store.js';
import { parseOrchestratorConfig, PATTERNS_ALL_TIERS, PATTERNS_STRICT_ONLY } from '@franken/orchestrator';
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
  const configPath = options.configPath ?? join(root, '.fbeast', 'config.json');

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

function loadFirewallScanConfig(configPath: string, fallbackTier: InjectionTier): FirewallScanConfig {
  const fallbackProfile: SecurityProfile = fallbackTier === 'strict' ? 'strict' : 'standard';
  if (!existsSync(configPath)) {
    return { profile: fallbackProfile, injectionDetection: true, customRules: [] };
  }

  const raw = readFileSync(configPath, 'utf8');
  const parsed = parseOrchestratorConfig(JSON.parse(raw));
  const security = parsed.security;
  const profile = security?.profile ?? 'standard';
  return {
    profile,
    injectionDetection: security?.injectionDetection ?? profile !== 'permissive',
    customRules: security?.customRules ?? [],
  };
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
