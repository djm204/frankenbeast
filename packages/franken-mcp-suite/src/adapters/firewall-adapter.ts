import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createSqliteStore } from '../shared/sqlite-store.js';

const ORCHESTRATOR_INJECTION_PATTERNS: RegExp[] = [
  /ignore\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context|commands?)/i,
  /disregard\s+(all\s+)?(previous|prior|above|earlier)\s+(instructions?|prompts?|context)/i,
  /forget\s+(everything|all)\s+(you('ve|\s+have)\s+been\s+told|above|before)/i,
  /your\s+(real|true|actual|new|primary)\s+(role|purpose|goal|task|job|objective)\s+is/i,
  /you\s+are\s+(now|actually|really)\s+(a|an)\s+\w+/i,
  /act\s+as\s+(if\s+you\s+(are|were)|a|an)\s+\w+\s+(without|that\s+ignores)/i,
  /as\s+a\s+reminder,?\s+(your\s+)?(real|actual|true|primary)\s+task/i,
  /the\s+(real|actual|true)\s+instructions?\s+(are|is|follow)/i,
  /\[system\][\s\S]{0,50}(ignore|override|forget|disregard)/i,
  /<\/?system>/i,
  /\[INST\]/i,
  /<<SYS>>/i,
  /\bDAN\b.*\bmode\b/i,
  /\bjailbreak\b/i,
  /aWdub3Jl/,
];

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

export function createFirewallAdapter(dbPathOrDeps: string | FirewallAdapterDeps): FirewallAdapter {
  if (typeof dbPathOrDeps !== 'string') {
    return dbPathOrDeps;
  }

  const store = createSqliteStore(dbPathOrDeps);

  return {
    async scanText(input) {
      const result = scanWithOrchestratorPatterns(input);
      logScan(input, result);
      return result;
    },

    async scanFile(path) {
      const content = readFileSync(path, 'utf8');
      const result = scanWithOrchestratorPatterns(content);
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

function scanWithOrchestratorPatterns(input: string): FirewallScanResult {
  const matchedPatterns = ORCHESTRATOR_INJECTION_PATTERNS
    .filter((pattern) => pattern.test(input))
    .map((pattern) => pattern.source);

  return {
    verdict: matchedPatterns.length > 0 ? 'flagged' : 'clean',
    matchedPatterns,
  };
}
