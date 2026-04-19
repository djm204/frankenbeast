import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSqliteStore } from '../shared/sqlite-store.js';
import { PATTERNS_ALL_TIERS, PATTERNS_STRICT_ONLY } from 'franken-orchestrator';
import type { InjectionTier } from 'franken-orchestrator';

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
): FirewallAdapter {
  if (typeof dbPathOrDeps !== 'string') {
    return dbPathOrDeps;
  }

  const store = createSqliteStore(dbPathOrDeps);
  const patterns = tier === 'strict'
    ? [...PATTERNS_ALL_TIERS, ...PATTERNS_STRICT_ONLY]
    : PATTERNS_ALL_TIERS;

  return {
    async scanText(input) {
      const result = scanWithPatterns(input, patterns);
      logScan(input, result);
      return result;
    },

    async scanFile(path) {
      const content = readFileSync(path, 'utf8');
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
