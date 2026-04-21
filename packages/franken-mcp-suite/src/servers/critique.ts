#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { createCritiqueAdapter, type CritiqueAdapter } from '../adapters/critique-adapter.js';
import { parseArgs } from 'node:util';

export interface CritiqueServerDeps {
  critique: CritiqueAdapter;
}

export function createCritiqueServer(deps: CritiqueServerDeps): FbeastMcpServer {
  const { critique } = deps;
  const tools: ToolDef[] = [
    {
      name: 'fbeast_critique_evaluate',
      description: 'Evaluate content against criteria. Returns verdict (pass/warn/fail), score (0-1), and findings.',
      inputSchema: {
        type: 'object',
        properties: {
          content: { type: 'string', description: 'Code or text to evaluate' },
          criteria: { type: 'string', description: 'Comma-separated criteria: correctness, readability, security, complexity' },
          evaluators: { type: 'string', description: 'Comma-separated evaluator names (e.g. logic-loop, complexity)' },
        },
        required: ['content'],
      },
      async handler(args) {
        const content = String(args['content']);
        const criteria = splitCsvArg(args['criteria']) ?? ['correctness', 'readability', 'security', 'complexity'];
        const evaluators = splitCsvArg(args['evaluators']);
        const result = await critique.evaluate(evaluators ? { content, criteria, evaluators } : { content, criteria });

        const findingsText = result.findings.length > 0
          ? result.findings.map((f) => `  [${f.severity}] ${f.message}`).join('\n')
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
        const result = await critique.compare({ original, revised });

        const text = [
          `## Comparison`,
          ``,
          `**original score:** ${result.originalScore.toFixed(2)}`,
          `**revised score:** ${result.revisedScore.toFixed(2)}`,
          `**delta:** ${result.delta >= 0 ? '+' : ''}${result.delta.toFixed(2)} (${result.direction})`,
          ``,
          `### Original findings (${result.originalFindings.length})`,
          ...result.originalFindings.map((f) => `- [${f.severity}] ${f.message}`),
          ``,
          `### Revised findings (${result.revisedFindings.length})`,
          ...result.revisedFindings.map((f) => `- [${f.severity}] ${f.message}`),
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      },
    },
  ];

  return createMcpServer('fbeast-critique', '0.1.0', tools);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const critique = createCritiqueAdapter();
  const server = createCritiqueServer({ critique });
  server.start().catch((err) => {
    console.error('fbeast-critique failed to start:', err);
    process.exit(1);
  });
}

function splitCsvArg(value: unknown, fallback?: string[]): string[] | undefined {
  if (value === undefined) {
    return fallback;
  }

  const parsed = String(value)
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parsed.length > 0 ? parsed : fallback;
}
