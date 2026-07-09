import { createHash } from 'node:crypto';
import { readFileSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
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

export function createFirewallAdapter(
  dbPathOrDeps: string | FirewallAdapterDeps,
  tier: InjectionTier = 'standard',
  options: { root?: string | undefined } = {},
): FirewallAdapter {
  if (typeof dbPathOrDeps !== 'string') {
    return dbPathOrDeps;
  }

  const store = createSqliteStore(dbPathOrDeps);
  const patterns = tier === 'strict'
    ? [...PATTERNS_ALL_TIERS, ...PATTERNS_STRICT_ONLY]
    : PATTERNS_ALL_TIERS;

  const root = realpathSync(resolve(options.root ?? process.env['FBEAST_ROOT'] ?? process.cwd()));

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
      const result = scanWithPatterns(input, patterns);
      logScan(input, result);
      return result;
    },

    async scanFile(path) {
      const safePath = resolveContained(path);
      const content = readFileSync(safePath, 'utf8');
      const result = scanWithPatterns(content, patterns);
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

function scanWithPatterns(input: string, patterns: RegExp[]): FirewallScanResult {
  const matchedPatterns = patterns
    .filter((pattern) => pattern.test(input))
    .map((pattern) => pattern.source);

  return {
    verdict: matchedPatterns.length > 0 ? 'flagged' : 'clean',
    matchedPatterns,
  };
}
