#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

const INJECTION_PATTERNS: Array<{ name: string; pattern: RegExp }> = [
  { name: 'ignore_instructions', pattern: /ignore\s+(all\s+)?(previous|prior|above)\s+(instructions|prompts?|rules?)/i },
  { name: 'system_prompt_leak', pattern: /output\s+(the\s+)?(system\s+prompt|instructions|rules)/i },
  { name: 'role_override', pattern: /you\s+are\s+now\s+(a|an)\s+/i },
  { name: 'jailbreak_dan', pattern: /\bDAN\b.*\bdo\s+anything\s+now\b/i },
  { name: 'prompt_delimiter', pattern: /```\s*(system|admin|root)\s*\n/i },
  { name: 'instruction_override', pattern: /disregard\s+(all\s+)?(previous|prior|earlier)/i },
  { name: 'base64_injection', pattern: /\batob\s*\(|base64\s*decode/i },
  { name: 'markdown_injection', pattern: /!\[.*\]\(https?:\/\/.*\?.*=.*\)/i },
];

interface ScanResult {
  verdict: 'clean' | 'flagged';
  matchedPatterns: string[];
}

function scanInput(input: string): ScanResult {
  const matched: string[] = [];
  for (const { name, pattern } of INJECTION_PATTERNS) {
    if (pattern.test(input)) {
      matched.push(name);
    }
  }
  return {
    verdict: matched.length > 0 ? 'flagged' : 'clean',
    matchedPatterns: matched,
  };
}

export function createFirewallServer(store: SqliteStore): FbeastMcpServer {
  const { db } = store;

  function logScan(inputHash: string, result: ScanResult): void {
    db.prepare(`
      INSERT INTO firewall_log (input_hash, verdict, matched_patterns)
      VALUES (?, ?, ?)
    `).run(inputHash, result.verdict, result.matchedPatterns.join(',') || null);
  }

  const tools: ToolDef[] = [
    {
      name: 'fbeast_firewall_scan',
      description: 'Scan text input for prompt injection patterns. Returns clean or flagged with matched patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          input: { type: 'string', description: 'Text to scan for injection patterns' },
        },
        required: ['input'],
      },
      async handler(args) {
        const input = String(args['input']);
        const result = scanInput(input);
        const inputHash = createHash('sha256').update(input).digest('hex').slice(0, 16);
        logScan(inputHash, result);

        if (result.verdict === 'clean') {
          return { content: [{ type: 'text', text: 'Scan result: clean. No injection patterns detected.' }] };
        }
        return {
          content: [{
            type: 'text',
            text: `Scan result: flagged\nMatched patterns: ${result.matchedPatterns.join(', ')}\n\nThis input may contain prompt injection. Review before processing.`,
          }],
        };
      },
    },
    {
      name: 'fbeast_firewall_scan_file',
      description: 'Read a file and scan its contents for prompt injection patterns.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string', description: 'File path to scan' },
        },
        required: ['path'],
      },
      async handler(args) {
        const filePath = String(args['path']);
        let content: string;
        try {
          content = readFileSync(filePath, 'utf-8');
        } catch (err) {
          return {
            content: [{ type: 'text', text: `Error reading file: ${err instanceof Error ? err.message : String(err)}` }],
            isError: true,
          };
        }

        const result = scanInput(content);
        const inputHash = createHash('sha256').update(content).digest('hex').slice(0, 16);
        logScan(inputHash, result);

        if (result.verdict === 'clean') {
          return { content: [{ type: 'text', text: `File scan (${filePath}): clean. No injection patterns detected.` }] };
        }
        return {
          content: [{
            type: 'text',
            text: `File scan (${filePath}): flagged\nMatched patterns: ${result.matchedPatterns.join(', ')}\n\nThis file may contain prompt injection. Review before processing.`,
          }],
        };
      },
    },
  ];

  return createMcpServer('fbeast-firewall', '0.1.0', tools);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const store = createSqliteStore(values['db']!);
  const server = createFirewallServer(store);
  server.start().catch((err) => {
    console.error('fbeast-firewall failed to start:', err);
    process.exit(1);
  });
}
