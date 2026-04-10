#!/usr/bin/env node
import { createMcpServer, type FbeastMcpServer, type ToolDef } from '../shared/server-factory.js';
import { createSqliteStore, type SqliteStore } from '../shared/sqlite-store.js';
import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';

interface TaskNode {
  id: string;
  title: string;
  deps: string[];
  status: 'pending' | 'done';
}

interface PlanDag {
  objective: string;
  constraints: string | null;
  tasks: TaskNode[];
}

export function createPlannerServer(store: SqliteStore): FbeastMcpServer {
  const { db } = store;

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
        const constraints = args['constraints'] ? String(args['constraints']) : null;
        const planId = randomUUID().slice(0, 8);

        const dag: PlanDag = {
          objective,
          constraints,
          tasks: [
            { id: 't1', title: `Analyze requirements for: ${objective}`, deps: [], status: 'pending' },
            { id: 't2', title: 'Design solution architecture', deps: ['t1'], status: 'pending' },
            { id: 't3', title: 'Write failing tests', deps: ['t2'], status: 'pending' },
            { id: 't4', title: 'Implement solution', deps: ['t3'], status: 'pending' },
            { id: 't5', title: 'Verify tests pass', deps: ['t4'], status: 'pending' },
            { id: 't6', title: 'Review and refine', deps: ['t5'], status: 'pending' },
          ],
        };

        db.prepare(`
          INSERT INTO plans (id, objective, dag, status) VALUES (?, ?, ?, 'pending')
        `).run(planId, objective, JSON.stringify(dag));

        const taskList = dag.tasks
          .map((t) => `  ${t.id}: ${t.title}${t.deps.length > 0 ? ` (after: ${t.deps.join(', ')})` : ''}`)
          .join('\n');

        const text = [
          `## Plan created: ${planId}`,
          ``,
          `**Objective:** ${objective}`,
          constraints ? `**Constraints:** ${constraints}` : '',
          ``,
          `**Tasks:**`,
          taskList,
          ``,
          `Use fbeast_plan_visualize with planId "${planId}" to see the DAG.`,
          `Use fbeast_plan_validate with planId "${planId}" to check for issues.`,
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
        const row = db.prepare(`SELECT dag FROM plans WHERE id = ?`).get(planId) as { dag: string } | undefined;

        if (!row) {
          return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
        }

        const dag: PlanDag = JSON.parse(row.dag);
        const mermaidLines = ['graph TD'];
        for (const task of dag.tasks) {
          mermaidLines.push(`  ${task.id}["${task.title}"]`);
          for (const dep of task.deps) {
            mermaidLines.push(`  ${dep} --> ${task.id}`);
          }
        }

        const text = [
          `## Plan: ${planId}`,
          ``,
          '```mermaid',
          ...mermaidLines,
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
        const row = db.prepare(`SELECT dag FROM plans WHERE id = ?`).get(planId) as { dag: string } | undefined;

        if (!row) {
          return { content: [{ type: 'text', text: `Plan not found: ${planId}` }], isError: true };
        }

        const dag: PlanDag = JSON.parse(row.dag);
        const issues: string[] = [];
        const taskIds = new Set(dag.tasks.map((t) => t.id));

        for (const task of dag.tasks) {
          for (const dep of task.deps) {
            if (!taskIds.has(dep)) {
              issues.push(`Task ${task.id} depends on unknown task: ${dep}`);
            }
          }
        }

        const visited = new Set<string>();
        const inStack = new Set<string>();
        const adjMap = new Map<string, string[]>();
        for (const t of dag.tasks) {
          adjMap.set(t.id, t.deps);
        }

        function hasCycle(node: string): boolean {
          if (inStack.has(node)) return true;
          if (visited.has(node)) return false;
          visited.add(node);
          inStack.add(node);
          for (const dep of adjMap.get(node) ?? []) {
            if (hasCycle(dep)) return true;
          }
          inStack.delete(node);
          return false;
        }

        for (const task of dag.tasks) {
          if (hasCycle(task.id)) {
            issues.push('Cycle detected in task dependencies');
            break;
          }
        }

        if (dag.tasks.length === 0) {
          issues.push('Plan has no tasks');
        }

        const verdict = issues.length === 0 ? 'valid' : 'invalid';
        const text = [
          `## Validation: ${verdict}`,
          ``,
          `**Plan:** ${planId}`,
          `**Tasks:** ${dag.tasks.length}`,
          '',
          issues.length > 0
            ? `**Issues:**\n${issues.map((i) => `- ${i}`).join('\n')}`
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
  const store = createSqliteStore(values['db']!);
  const server = createPlannerServer(store);
  server.start().catch((err) => {
    console.error('fbeast-planner failed to start:', err);
    process.exit(1);
  });
}
