import { randomUUID } from 'node:crypto';
import { PlanGraph, createTaskId } from 'franken-planner';
import { createSqliteStore } from '../shared/sqlite-store.js';

export interface PlannerTask {
  id: string;
  title: string;
  deps: string[];
  status: 'pending' | 'done';
}

export interface PlannerDecomposeResult {
  planId: string;
  objective: string;
  tasks: PlannerTask[];
}

export interface PlannerValidateResult {
  verdict: 'valid' | 'invalid';
  issues: string[];
}

export interface PlannerAdapter {
  decompose(input: { objective: string; constraints?: string }): Promise<PlannerDecomposeResult>;
  visualize(planId: string): Promise<string | null>;
  validate(planId: string): Promise<PlannerValidateResult | null>;
}

interface StoredPlan {
  objective: string;
  constraints: string | null;
  tasks: PlannerTask[];
}

export function createPlannerAdapter(dbPath: string): PlannerAdapter {
  const store = createSqliteStore(dbPath);

  return {
    async decompose(input) {
      // Returns a scaffold DAG — not LLM-generated decomposition.
      // franken-planner is a graph library (validate, visualize, cycle detection),
      // not a planning engine. Real decomposition requires an LLM, and since this
      // MCP tool is called BY an LLM (Claude Code), injecting a second LLM call
      // here would be circular. The caller refines this scaffold as needed.
      const planId = randomUUID().slice(0, 8);
      const tasks: PlannerTask[] = [
        { id: 't1', title: `Analyze requirements for: ${input.objective}`, deps: [], status: 'pending' },
        { id: 't2', title: 'Design solution architecture', deps: ['t1'], status: 'pending' },
        { id: 't3', title: 'Write failing tests', deps: ['t2'], status: 'pending' },
        { id: 't4', title: 'Implement solution', deps: ['t3'], status: 'pending' },
        { id: 't5', title: 'Verify tests pass', deps: ['t4'], status: 'pending' },
        { id: 't6', title: 'Review and refine', deps: ['t5'], status: 'pending' },
      ];

      const stored: StoredPlan = {
        objective: input.objective,
        constraints: input.constraints ?? null,
        tasks,
      };

      store.db.prepare(`
        INSERT INTO plans (id, objective, dag, status) VALUES (?, ?, ?, 'pending')
      `).run(planId, input.objective, JSON.stringify(stored));

      return { planId, objective: input.objective, tasks };
    },

    async visualize(planId) {
      const plan = loadPlan(planId);
      if (!plan) {
        return null;
      }

      const graph = buildGraph(plan.tasks);
      const mermaidLines = ['graph TD'];

      for (const task of graph.getTasks()) {
        mermaidLines.push(`  ${task.id}["${task.objective}"]`);
        for (const dep of graph.getDependencies(task.id)) {
          mermaidLines.push(`  ${dep} --> ${task.id}`);
        }
      }

      return mermaidLines.join('\n');
    },

    async validate(planId) {
      const plan = loadPlan(planId);
      if (!plan) {
        return null;
      }

      const issues: string[] = [];
      const taskIds = new Set(plan.tasks.map((task) => task.id));

      for (const task of plan.tasks) {
        for (const dep of task.deps) {
          if (!taskIds.has(dep)) {
            issues.push(`Task ${task.id} depends on unknown task: ${dep}`);
          }
        }
      }

      if (plan.tasks.length === 0) {
        issues.push('Plan has no tasks');
      }

      if (issues.length === 0) {
        const graph = buildGraph(plan.tasks);
        if (graph.hasCycle()) {
          issues.push('Cycle detected in task dependencies');
        }
      }

      return {
        verdict: issues.length === 0 ? 'valid' : 'invalid',
        issues,
      };
    },
  };

  function loadPlan(planId: string): StoredPlan | null {
    const row = store.db.prepare('SELECT dag FROM plans WHERE id = ?').get(planId) as { dag: string } | undefined;
    if (!row) {
      return null;
    }
    return JSON.parse(row.dag) as StoredPlan;
  }
}

function buildGraph(tasks: PlannerTask[]): PlanGraph {
  let graph = PlanGraph.empty();

  for (const task of tasks) {
    graph = graph.addTask({
      id: createTaskId(task.id),
      objective: task.title,
      requiredSkills: [],
      dependsOn: task.deps.map((dep) => createTaskId(dep)),
      status: task.status === 'done' ? 'completed' : 'pending',
    }, task.deps.map((dep) => createTaskId(dep)));
  }

  return graph;
}
