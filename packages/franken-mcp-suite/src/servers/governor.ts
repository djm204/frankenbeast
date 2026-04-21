#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { isMain } from '../shared/is-main.js';
import { createGovernorAdapter, type GovernorAdapter } from '../adapters/governor-adapter.js';
import { parseArgs } from 'node:util';

export interface GovernorServerDeps {
  governor: GovernorAdapter;
}

export function createGovernorServer(deps: GovernorServerDeps): FbeastMcpServer {
  const { governor } = deps;

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
        const { decision, reason } = await governor.check({ action, context });

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
        const summary = await governor.budgetStatus();

        if (summary.byModel.length === 0) {
          return { content: [{ type: 'text', text: 'No cost data recorded yet.' }] };
        }

        const lines = [
          `## Budget Status`,
          '',
          ...summary.byModel.map((row) => `- ${row.model}: $${row.costUsd.toFixed(4)}`),
          '',
          `**Total spend:** $${summary.totalSpendUsd.toFixed(4)}`,
        ];

        return { content: [{ type: 'text', text: lines.join('\n') }] };
      },
    },
  ];

  return createMcpServer('fbeast-governor', '0.1.0', tools);
}

if (isMain(import.meta.url)) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const governor = createGovernorAdapter(values['db']!);
  const server = createGovernorServer({ governor });
  server.start().catch((err) => {
    console.error('fbeast-governor failed to start:', err);
    process.exit(1);
  });
}
