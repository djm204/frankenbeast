#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
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

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
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
