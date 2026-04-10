#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { parseArgs } from 'node:util';

interface Finding {
  criterion: string;
  severity: 'info' | 'warning' | 'error';
  message: string;
}

interface EvalResult {
  verdict: 'pass' | 'warn' | 'fail';
  score: number;
  findings: Finding[];
}

function evaluateContent(content: string, criteria: string[]): EvalResult {
  const findings: Finding[] = [];

  for (const criterion of criteria) {
    switch (criterion) {
      case 'correctness':
        if (/console\.log\(/g.test(content)) {
          findings.push({ criterion, severity: 'warning', message: 'Contains console.log — remove before production' });
        }
        if (/TODO|FIXME|HACK/g.test(content)) {
          findings.push({ criterion, severity: 'warning', message: 'Contains TODO/FIXME/HACK markers' });
        }
        break;
      case 'readability':
        if (content.split('\n').some((line) => line.length > 120)) {
          findings.push({ criterion, severity: 'info', message: 'Lines exceed 120 characters' });
        }
        break;
      case 'security':
        if (/eval\(|new Function\(/g.test(content)) {
          findings.push({ criterion, severity: 'error', message: 'Uses eval() or new Function() — potential code injection' });
        }
        if (/password|secret|api.?key/i.test(content) && /['"`][A-Za-z0-9]{8,}/g.test(content)) {
          findings.push({ criterion, severity: 'error', message: 'Possible hardcoded credential detected' });
        }
        break;
      case 'complexity':
        const lines = content.split('\n').length;
        if (lines > 300) {
          findings.push({ criterion, severity: 'warning', message: `File is ${lines} lines — consider splitting` });
        }
        const nestingDepth = Math.max(...content.split('\n').map((l) => l.search(/\S/) / 2));
        if (nestingDepth > 5) {
          findings.push({ criterion, severity: 'warning', message: `Deep nesting detected (${Math.round(nestingDepth)} levels)` });
        }
        break;
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warnCount = findings.filter((f) => f.severity === 'warning').length;

  const score = Math.max(0, 1.0 - errorCount * 0.3 - warnCount * 0.1);
  const verdict = errorCount > 0 ? 'fail' : warnCount > 0 ? 'warn' : 'pass';

  return { verdict, score, findings };
}

export function createCritiqueServer(store: SqliteStore): FbeastMcpServer {
  const tools: ToolDef[] = [
    {
      name: 'fbeast_critique_evaluate',
      description: 'Evaluate content against criteria. Returns verdict (pass/warn/fail), score (0-1), and findings.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Code or text to evaluate' },
          criteria: { type: 'string', description: 'Comma-separated criteria: correctness, readability, security, complexity' },
        },
        required: ['content'],
      },
      async handler(args) {
        const content = String(args['content']);
        const criteriaStr = args['criteria'] ? String(args['criteria']) : 'correctness,readability,security,complexity';
        const criteria = criteriaStr.split(',').map((c) => c.trim());

        const result = evaluateContent(content, criteria);

        const findingsText = result.findings.length > 0
          ? result.findings.map((f) => `  [${f.severity}] ${f.criterion}: ${f.message}`).join('\n')
          : '  None';

        const text = [
          `## Critique Result`,
          ``,
          `**verdict:** ${result.verdict}`,
          `**score:** ${result.score.toFixed(2)}`,
          `**findings:**`,
          findingsText,
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      },
    },
    {
      name: 'fbeast_critique_compare',
      description: 'Compare original and revised content. Shows improvement delta.',
      inputSchema: {
        type: 'object',
        properties: {
          original: { type: 'string', description: 'Original content' },
          revised: { type: 'string', description: 'Revised content' },
        },
        required: ['original', 'revised'],
      },
      async handler(args) {
        const original = String(args['original']);
        const revised = String(args['revised']);
        const defaultCriteria = ['correctness', 'readability', 'security', 'complexity'];

        const origResult = evaluateContent(original, defaultCriteria);
        const revResult = evaluateContent(revised, defaultCriteria);

        const delta = revResult.score - origResult.score;
        const direction = delta > 0 ? 'improved' : delta < 0 ? 'degraded' : 'unchanged';

        const text = [
          `## Comparison`,
          ``,
          `**original score:** ${origResult.score.toFixed(2)} (${origResult.verdict})`,
          `**revised score:** ${revResult.score.toFixed(2)} (${revResult.verdict})`,
          `**delta:** ${delta >= 0 ? '+' : ''}${delta.toFixed(2)} (${direction})`,
          ``,
          `### Original findings (${origResult.findings.length})`,
          ...origResult.findings.map((f) => `- [${f.severity}] ${f.message}`),
          ``,
          `### Revised findings (${revResult.findings.length})`,
          ...revResult.findings.map((f) => `- [${f.severity}] ${f.message}`),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      },
    },
  ];

  return createMcpServer('fbeast-critique', '0.1.0', tools);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const store = createSqliteStore(values['db']!);
  const server = createCritiqueServer(store);
  server.start().catch((err) => {
    console.error('fbeast-critique failed to start:', err);
    process.exit(1);
  });
}
