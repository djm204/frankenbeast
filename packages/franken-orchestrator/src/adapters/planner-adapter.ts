import type { ILlmClient } from '@franken/types';
import type { IPlannerModule, PlanGraph, PlanIntent, PlanTask } from '../deps.js';

export class PlannerPortAdapter implements IPlannerModule {
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
    const context = intent.context ? JSON.stringify(intent.context) : '{}';
    return [
      'You are a planner. Decompose the goal into a task DAG.',
      `Goal: ${intent.goal}`,
      `Strategy: ${intent.strategy ?? 'none'}`,
      `Context: ${context}`,
      'Return ONLY valid JSON with shape:',
      '{"tasks":[{"id":"task-1","objective":"...","requiredSkills":["skill"],"dependsOn":[]}]}',
    ].join('\n');
  }

  private parsePlan(response: string, intent: PlanIntent): PlanGraph {
    const fallback = this.singleTaskPlan(intent.goal);

    try {
      const parsed = JSON.parse(response) as { tasks?: unknown };
      if (!parsed || !Array.isArray(parsed.tasks)) {
        return fallback;
      }

      const tasks = parsed.tasks
        .map((task, index) => this.coerceTask(task, index, intent.goal))
        .filter(Boolean) as PlanTask[];

      if (tasks.length === 0) {
        return fallback;
      }

      return { tasks };
    } catch {
      return fallback;
    }
  }

  private coerceTask(task: unknown, index: number, fallbackObjective: string): PlanTask {
    const candidate = task as Partial<PlanTask> | null;
    const id = typeof candidate?.id === 'string' && candidate.id.trim().length > 0
      ? candidate.id
      : `task-${index + 1}`;
    const objective = typeof candidate?.objective === 'string' && candidate.objective.trim().length > 0
      ? candidate.objective
      : fallbackObjective;
    const requiredSkills = Array.isArray(candidate?.requiredSkills)
      ? candidate?.requiredSkills.filter((s): s is string => typeof s === 'string')
      : [];
    const dependsOn = Array.isArray(candidate?.dependsOn)
      ? candidate?.dependsOn.filter((s): s is string => typeof s === 'string')
      : [];

    return { id, objective, requiredSkills, dependsOn };
  }

  private singleTaskPlan(goal: string): PlanGraph {
    return {
      tasks: [
        {
          id: 'task-1',
          objective: goal,
          requiredSkills: [],
          dependsOn: [],
        },
      ],
    };
  }
}
