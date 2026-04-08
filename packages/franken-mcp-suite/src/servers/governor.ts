#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { parseArgs } from 'node:util';

const DANGEROUS_PATTERNS = [
  /delete/i, /drop/i, /truncate/i, /destroy/i, /remove.*all/i,
  /force.*push/i, /reset.*hard/i, /rm\s+-rf/i,
  /format/i, /wipe/i, /purge/i,
];

type Decision = 'approved' | 'review_recommended' | 'denied';

function assessAction(action: string, context: string): { decision: Decision; reason: string } {
  const combined = `${action} ${context}`;

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(combined)) {
      return {
        decision: 'review_recommended',
        reason: `Action "${action}" matches dangerous pattern. Human review recommended before proceeding.`,
      };
    }
  }

  return {
    decision: 'approved',
    reason: `Action "${action}" does not match any dangerous patterns.`,
  };
}

export function createGovernorServer(store: SqliteStore): FbeastMcpServer {
  const { db } = store;

  const tools: ToolDef[] = [
    {
      name: 'fbeast_governor_check',
      description: 'Check if an action should be approved or needs human review. Flags destructive operations.',
      inputSchema: {
        type: 'object',
        properties: {
          action: { type: 'string', description: 'Action name or description (e.g., delete_file, push_to_main)' },
          context: { type: 'string', description: 'JSON context about the action (target, scope, etc.)' },
        },
        required: ['action', 'context'],
      },
      async handler(args) {
        const action = String(args['action']);
        const context = String(args['context']);
        const { decision, reason } = assessAction(action, context);

        db.prepare(`
          INSERT INTO governor_log (action, context, decision, reason)
          VALUES (?, ?, ?, ?)
        `).run(action, context, decision, reason);

        return { content: [{ type: 'text', text: `**Decision:** ${decision}\n**Reason:** ${reason}` }] };
      },
    },
    {
      name: 'fbeast_governor_budget_status',
      description: 'Get current spend vs budget. Reads from cost_ledger table.',
      inputSchema: {
        type: 'object',
        properties: {},
      },
      async handler(_args) {
        const rows = db.prepare(`
          SELECT model,
            SUM(prompt_tokens) as total_prompt,
            SUM(completion_tokens) as total_completion,
            SUM(cost_usd) as total_cost
          FROM cost_ledger
          GROUP BY model
        `).all() as Array<{
          model: string; total_prompt: number; total_completion: number; total_cost: number;
        }>;

        if (rows.length === 0) {
          return { content: [{ type: 'text', text: 'No cost data recorded yet.' }] };
        }

        const totalCost = rows.reduce((s, r) => s + r.total_cost, 0);

        const lines = [
          `## Budget Status`,
          '',
          ...rows.map((r) => `- ${r.model}: $${r.total_cost.toFixed(4)}`),
          '',
          `**Total spend:** $${totalCost.toFixed(4)}`,
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },
  ];

  return createMcpServer('fbeast-governor', '0.1.0', tools);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const store = createSqliteStore(values['db']!);
  const server = createGovernorServer(store);
  server.start().catch((err) => {
    console.error('fbeast-governor failed to start:', err);
    process.exit(1);
  });
}
