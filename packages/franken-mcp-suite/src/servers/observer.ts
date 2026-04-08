#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { createHash } from 'node:crypto';
import { parseArgs } from 'node:util';

export function createObserverServer(store: SqliteStore): FbeastMcpServer {
  const { db } = store;

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

        const lastRow = db.prepare(
          `SELECT hash FROM audit_trail WHERE session_id = ? ORDER BY id DESC LIMIT 1`,
        ).get(sessionId) as { hash: string } | undefined;

        const parentHash = lastRow?.hash ?? null;
        const hash = createHash('sha256')
          .update(`${parentHash ?? ''}:${event}:${metadata}`)
          .digest('hex')
          .slice(0, 16);

        const result = db.prepare(`
          INSERT INTO audit_trail (session_id, event_type, payload, hash, parent_hash)
          VALUES (?, ?, ?, ?, ?)
        `).run(sessionId, event, metadata, hash, parentHash);

        return { content: [{ type: 'text', text: `Logged event: ${event} (id: ${result.lastInsertRowid}, hash: ${hash})` }] };
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

        let sql = `
          SELECT model,
            SUM(prompt_tokens) as total_prompt,
            SUM(completion_tokens) as total_completion,
            SUM(cost_usd) as total_cost
          FROM cost_ledger
        `;
        const params: unknown[] = [];

        if (sessionId) {
          sql += ` WHERE session_id = ?`;
          params.push(sessionId);
        }
        sql += ` GROUP BY model`;

        const rows = db.prepare(sql).all(...params) as Array<{
          model: string; total_prompt: number; total_completion: number; total_cost: number;
        }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'No cost data recorded.' }] };
        }

        const totalPrompt = rows.reduce((s, r) => s + r.total_prompt, 0);
        const totalCompletion = rows.reduce((s, r) => s + r.total_completion, 0);
        const totalCost = rows.reduce((s, r) => s + r.total_cost, 0);

        const lines = [
          `## Cost Summary${sessionId ? ` (session: ${sessionId})` : ''}`,
          '',
          ...rows.map((r) =>
            `- ${r.model}: ${r.total_prompt} prompt + ${r.total_completion} completion = $${r.total_cost.toFixed(4)}`),
          '',
          `**Total:** ${totalPrompt} prompt + ${totalCompletion} completion = $${totalCost.toFixed(4)}`,
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

        const rows = db.prepare(
          `SELECT event_type, payload, hash, created_at FROM audit_trail WHERE session_id = ? ORDER BY id ASC`,
        ).all(sessionId) as Array<{
          event_type: string; payload: string; hash: string; created_at: string;
        }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: `No audit trail for session: ${sessionId}` }] };
        }

        const text = rows
          .map((r, i) => `${i + 1}. [${r.created_at}] ${r.event_type} (${r.hash})\n   ${r.payload}`)
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
  const store = createSqliteStore(values['db']!);
  const server = createObserverServer(store);
  server.start().catch((err) => {
    console.error('fbeast-observer failed to start:', err);
    process.exit(1);
  });
}
