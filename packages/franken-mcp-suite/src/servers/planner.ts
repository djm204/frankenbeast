#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createPlannerAdapter, type PlannerAdapter } from '../adapters/planner-adapter.js';
import { parseArgs } from 'node:util';

export interface PlannerServerDeps {
  planner: PlannerAdapter;
}

export function createPlannerServer(deps: PlannerServerDeps): FbeastMcpServer {
  const { planner } = deps;

  const tools: ToolDef[] = [
    {
      name: 'fbeast_plan_decompose',
      description: 'Decompose an objective into a DAG of tasks. Stores the plan for later reference. Returns the plan ID and task list. Note: this creates a structural template — use your own judgment to fill in task details.',
      inputSchema: {
        type: 'object',
        properties: {
          objective: { type: 'string', description: 'What needs to be accomplished' },
          constraints: { type: 'string', description: 'Constraints or requirements (optional)' },
        },
        required: ['objective'],
      },
      async handler(args) {
        const objective = String(args['objective']);
        const constraints = args['constraints'] ? String(args['constraints']) : undefined;
        const result = await planner.decompose(constraints ? { objective, constraints } : { objective });

        const taskList = result.tasks
          .map((t) => `  ${t.id}: ${t.title}${t.deps.length > 0 ? ` (after: ${t.deps.join(', ')})` : ''}`)
          .join('\n');

        const text = [
          `## Plan created: ${result.planId}`,
          ``,
          `**Objective:** ${result.objective}`,
          constraints ? `**Constraints:** ${constraints}` : '',
          ``,
          `**Tasks:**`,
          taskList,
          ``,
          `Use fbeast_plan_visualize with planId "${result.planId}" to see the DAG.`,
          `Use fbeast_plan_validate with planId "${result.planId}" to check for issues.`,
        ].filter(Boolean).join('\n');

        return { content: [{ type: 'text', text }] };
      },
    },
    {
      name: 'fbeast_plan_visualize',
      description: 'Generate a mermaid diagram of an existing plan DAG.',
      inputSchema: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'Plan ID returned by fbeast_plan_decompose' },
        },
        required: ['planId'],
      },
      async handler(args) {
        const planId = String(args['planId']);
        const mermaid = await planner.visualize(planId);

        if (!mermaid) {
          return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
        }

        const text = [
          `## Plan: ${planId}`,
          ``,
          '```mermaid',
          mermaid,
          '```',
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      },
    },
    {
      name: 'fbeast_plan_validate',
      description: 'Validate an existing plan: check for cycles, missing dependencies, and structural issues.',
      inputSchema: {
        type: 'object',
        properties: {
          planId: { type: 'string', description: 'Plan ID to validate' },
        },
        required: ['planId'],
      },
      async handler(args) {
        const planId = String(args['planId']);
        const validation = await planner.validate(planId);

        if (!validation) {
          return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
        }
        const text = [
          `## Validation: ${validation.verdict}`,
          ``,
          `**Plan:** ${planId}`,
          `**Issues:** ${validation.issues.length}`,
          '',
          validation.issues.length > 0
            ? validation.issues.map((i) => `- ${i}`).join('\n')
            : 'No issues found.',
        ].join('\n');

        return { content: [{ type: 'text', text }] };
      },
    },
  ];

  return createMcpServer('fbeast-planner', '0.1.0', tools);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const { values } = parseArgs({
    options: { db: { type: 'string', default: '.fbeast/beast.db' } },
  });
  const planner = createPlannerAdapter(values['db']!);
  const server = createPlannerServer({ planner });
  server.start().catch((err) => {
    console.error('fbeast-planner failed to start:', err);
    process.exit(1);
  });
}
