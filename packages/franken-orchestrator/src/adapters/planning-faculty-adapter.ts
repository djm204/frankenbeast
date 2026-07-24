import type { EpisodicEvent, IEpisodicMemory, IPlanningFaculty } from '@franken/types';
import { isoNow } from '@franken/types';
import type { IPlannerModule, PlanGraph, PlanIntent, PlanTask } from '../deps.js';

export interface PlanningFacultyAdapterOptions {
  recordEpisodes?: boolean;
}

/**
 * Connects the Beast planner port to an agent brain's planning faculty while
 * preserving the planner's plan object and failure behavior unchanged.
 */
export class PlanningFacultyAdapter implements IPlannerModule, IPlanningFaculty {
  readonly kind = 'planning' as const;
  readonly configured = true;

  constructor(
    private readonly delegate: IPlannerModule,
    private readonly episodic: IEpisodicMemory,
    private readonly options: PlanningFacultyAdapterOptions = {},
  ) {}

  async createPlan(intent: PlanIntent): Promise<PlanGraph> {
    const plan = await this.delegate.createPlan(intent);
    this.recordPlanCreated(intent, plan);
    return plan;
  }

  recordPlanCreated(intent: PlanIntent, plan: PlanGraph): void {
    this.recordLifecycleEvent({
      type: 'decision',
      step: 'planning',
      summary: `Planning plan created: ${intent.goal}`,
      details: {
        category: 'planning-lifecycle',
        taskCount: plan.tasks.length,
        taskIds: plan.tasks.map((task) => task.id),
      },
      createdAt: isoNow(),
    });
  }

  /** Exercises the delegate without creating a user-visible lifecycle event. */
  async checkHealth(): Promise<void> {
    if (this.delegate.checkHealth) {
      await this.delegate.checkHealth();
      return;
    }
    await this.delegate.createPlan({ goal: 'health check' });
  }

  recordStepCompleted(task: PlanTask): void {
    this.recordLifecycleEvent({
      type: 'success',
      step: task.id,
      summary: `Planning step completed: ${task.objective}`,
      details: { category: 'planning-lifecycle', taskId: task.id },
      createdAt: isoNow(),
    });
  }

  recordStepFailed(task: PlanTask, error: unknown): void {
    this.recordLifecycleEvent({
      type: 'failure',
      step: task.id,
      summary: `Planning step failed: ${task.objective}`,
      details: {
        category: 'planning-lifecycle',
        taskId: task.id,
        errorName: error instanceof Error ? error.name : 'Error',
      },
      createdAt: isoNow(),
    });
  }

  private recordLifecycleEvent(event: EpisodicEvent): void {
    if (this.options.recordEpisodes === false) return;
    try {
      this.episodic.record(event);
    } catch {
      // Lifecycle telemetry must not replace successful planner/execution behavior.
    }
  }
}
