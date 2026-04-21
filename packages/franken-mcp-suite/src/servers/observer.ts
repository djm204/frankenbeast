#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { createObserverAdapter, type ObserverAdapter } from '../adapters/observer-adapter.js';
import { parseArgs } from 'node:util';

export interface ObserverServerDeps {
  observer: ObserverAdapter;
}

export function createObserverServer(deps: ObserverServerDeps): FbeastMcpServer {
  const { observer } = deps;

  const tools: ToolDef[] = [
    {
      name: 'fbeast_observer_log',
      description: 'Log an event to the audit trail. Returns the trace entry ID.',
      inputSchema: {
        type: 'object',
        properties: {
          event: { type: 'string', description: 'Event type (e.g., file_edit, tool_call, decision)' },
          metadata: { type: 'string', description: 'JSON metadata for this event' },
          sessionId: { type: 'string', description: 'Session identifier' },
        },
        required: ['event', 'metadata', 'sessionId'],
      },
      async handler(args) {
        const event = String(args['event']);
        const metadata = String(args['metadata']);
        const sessionId = String(args['sessionId']);
        const result = await observer.log({ event, metadata, sessionId });

        return {
          content: [{ type: 'text', text: `Logged event: ${event} (id: ${result.id}, hash: ${result.hash})` }],
        };
      },
    },
    {
      name: 'fbeast_observer_log_cost',
      description: 'Record token usage and cost for an LLM call. Call this after each significant model invocation you make.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session identifier' },
          model: { type: 'string', description: 'Model name (e.g. gpt-4o, claude-opus-4-5)' },
          promptTokens: { type: 'number', description: 'Input/prompt token count' },
          completionTokens: { type: 'number', description: 'Output/completion token count' },
          costUsd: { type: 'number', description: 'Actual cost in USD if known — omit to auto-calculate from pricing table' },
        },
        required: ['sessionId', 'model', 'promptTokens', 'completionTokens'],
      },
      async handler(args) {
        const sessionId = String(args['sessionId']);
        const model = String(args['model']);
        const promptTokens = Number(args['promptTokens']);
        const completionTokens = Number(args['completionTokens']);
        const costUsdArg = args['costUsd'] != null ? Number(args['costUsd']) : undefined;
        await observer.logCost({ sessionId, model, promptTokens, completionTokens, ...(costUsdArg != null ? { costUsd: costUsdArg } : {}) });
        return {
          content: [{ type: 'text', text: `Logged cost: ${promptTokens}+${completionTokens} tokens for ${model}` }],
        };
      },
    },
    {
      name: 'fbeast_observer_cost',
      description: 'Get token usage and cost summary for a session or all sessions.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session ID to filter (omit for all sessions)' },
        },
      },
      async handler(args) {
        const sessionId = args['sessionId'] ? String(args['sessionId']) : undefined;
        const summary = await observer.cost(sessionId ? { sessionId } : {});

        if (summary.byModel.length === 0) {
          return { content: [{ type: 'text', text: 'No cost data recorded.' }] };
        }

        const lines = [
          `## Cost Summary${sessionId ? ` (session: ${sessionId})` : ''}`,
          '',
          ...summary.byModel.map((row) =>
            `- ${row.model}: ${row.promptTokens} prompt + ${row.completionTokens} completion = $${row.costUsd.toFixed(4)}`),
          '',
          `**Total:** ${summary.totalPromptTokens} prompt + ${summary.totalCompletionTokens} completion = $${summary.totalCostUsd.toFixed(4)}`,
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },
    {
      name: 'fbeast_observer_trail',
      description: 'Get the full audit trail for a session.',
      inputSchema: {
        type: 'object',
        properties: {
          sessionId: { type: 'string', description: 'Session identifier' },
        },
        required: ['sessionId'],
      },
      async handler(args) {
        const sessionId = String(args['sessionId']);
        const rows = await observer.trail(sessionId);

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `No audit trail for session: ${sessionId}` }] };
        }

        const text = rows
          .map((row, index) => `${index + 1}. [${row.createdAt}] ${row.eventType} (${row.hash ?? 'no-hash'})\n   ${row.payload}`)
          .join('\n');

        return { content: [{ type: 'text', text: `## Audit Trail (${rows.length} events)\n\n${text}` }] };
      },
    },
  ];

  return createMcpServer('fbeast-observer', '0.1.0', tools);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const observer = createObserverAdapter(values['db']!);
  const server = createObserverServer({ observer });
  server.start().catch((err) => {
    console.error('fbeast-observer failed to start:', err);
    process.exit(1);
  });
}
