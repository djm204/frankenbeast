import type { ILlmClient } from '@franken/types';
import type { IPlannerModule, PlanGraph, PlanIntent, PlanTask } from '../deps.js';
import { wrapUntrustedContent } from '../prompt/untrusted-content.js';
import { cleanLlmJson } from './providers/stream-json-utils.js';

type RawPlanResponse = { tasks?: unknown };

type RawTask = {
  id?: unknown;
  objective?: unknown;
  dependsOn?: unknown;
};

class PlanStructureError extends Error {}

export class LlmPlanner implements IPlannerModule {
  private readonly llmClient: ILlmClient;

  constructor(llmClient: ILlmClient) {
    this.llmClient = llmClient;
  }

  async createPlan(intent: PlanIntent): Promise<PlanGraph> {
    const prompt = this.buildPrompt(intent);
    const response = await this.llmClient.complete(prompt);
    return this.parsePlan(response, intent);
  }

  private buildPrompt(intent: PlanIntent): string {
    const context = wrapUntrustedContent(
      { kind: 'planner-context', source: 'plan-intent.context' },
      JSON.stringify(intent.context ?? {}),
    );

    return [
      'You are a planner. Decompose the goal into a task DAG.',
      `Goal: ${intent.goal}`,
      `Strategy: ${intent.strategy ?? 'none'}`,
      ...(intent.critiqueFeedback ? ['Trusted replan critique feedback:', intent.critiqueFeedback] : []),
      `Context: ${context}`,
      'Return ONLY valid JSON with shape:',
      '{ "tasks": [{ "id": "t1", "objective": "...", "requiredSkills": ["llm-generate"], "dependsOn": [] }] }',
    ].join('\n');
  }

  private parsePlan(response: string, intent: PlanIntent): PlanGraph {
    const fallback = this.singleTaskPlan(intent.goal);
    const text = cleanLlmJson(response);

    try {
      const parsed = JSON.parse(text) as RawPlanResponse;
      if (!parsed || !Array.isArray(parsed.tasks)) {
        return fallback;
      }

      const rawTasks = parsed.tasks as RawTask[];
      if (rawTasks.length === 0) {
        return fallback;
      }

      const idMap = this.buildIdMap(rawTasks);
      const tasks = rawTasks.map((task, index) => this.coerceTask(task, index, intent.goal, idMap));

      if (this.hasCycle(tasks)) {
        return fallback;
      }

      return { tasks };
    } catch (error) {
      if (error instanceof PlanStructureError) {
        throw error;
      }
      return fallback;
    }
  }

  private buildIdMap(rawTasks: RawTask[]): Map<string, string> {
    const idMap = new Map<string, string>();

    rawTasks.forEach((task, index) => {
      const rawId = typeof task?.id === 'string' && task.id.trim().length > 0
        ? task.id.trim()
        : `t${index + 1}`;
      idMap.set(rawId, `t${index + 1}`);
    });

    return idMap;
  }

  private coerceTask(
    raw: RawTask,
    index: number,
    fallbackObjective: string,
    idMap: Map<string, string>,
  ): PlanTask {
    const objective = typeof raw?.objective === 'string' && raw.objective.trim().length > 0
      ? raw.objective.trim()
      : fallbackObjective;
    const taskId = typeof raw?.id === 'string' && raw.id.trim().length > 0
      ? raw.id.trim()
      : `t${index + 1}`;
    const dependsOn = Array.isArray(raw?.dependsOn)
      ? raw.dependsOn.map((dep, depIndex) => {
        if (typeof dep !== 'string') {
          throw new PlanStructureError(
            `Invalid plan structure: task '${taskId}' has non-string dependency at index ${depIndex}`,
          );
        }
        const normalizedDep = dep.trim();
        const mappedDep = idMap.get(normalizedDep);
        if (mappedDep === undefined) {
          throw new PlanStructureError(
            `Invalid plan structure: task '${taskId}' depends on unknown task '${normalizedDep}'`,
          );
        }
        return mappedDep;
      })
      : [];

    return {
      id: `t${index + 1}`,
      objective,
      requiredSkills: ['llm-generate'],
      dependsOn,
    };
  }

  private hasCycle(tasks: PlanTask[]): boolean {
    const byId = new Map(tasks.map(task => [task.id, task]));
    const visiting = new Set<string>();
    const visited = new Set<string>();

    const visit = (id: string): boolean => {
      if (visiting.has(id)) return true;
      if (visited.has(id)) return false;

      visiting.add(id);
      const task = byId.get(id);
      for (const dep of task?.dependsOn ?? []) {
        if (visit(dep)) return true;
      }
      visiting.delete(id);
      visited.add(id);
      return false;
    };

    for (const task of tasks) {
      if (visit(task.id)) {
        return true;
      }
    }

    return false;
  }

  private singleTaskPlan(goal: string): PlanGraph {
    return {
      tasks: [
        {
          id: 't1',
          objective: goal,
          requiredSkills: ['llm-generate'],
          dependsOn: [],
        },
      ],
    };
  }
}
