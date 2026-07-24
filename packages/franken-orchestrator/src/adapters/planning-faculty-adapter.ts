import type { EpisodicEvent, IEpisodicMemory, IPlanningFaculty } from '@franken/types';
import { isoNow } from '@franken/types';
import type { IPlannerModule, PlanGraph, PlanIntent, PlanTask } from '../deps.js';

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
  ) {}

  async createPlan(intent: PlanIntent): Promise<PlanGraph> {
    const plan = await this.delegate.createPlan(intent);
    this.recordLifecycleEvent({
      type: 'decision',
      step: 'planning',
      summary: `Planning plan created: ${intent.goal}`,
      details: {
        taskCount: plan.tasks.length,
        taskIds: plan.tasks.map((task) => task.id),
      },
      createdAt: isoNow(),
    });
    return plan;
  }

  /** Exercises the delegate without creating a user-visible lifecycle event. */
  async checkHealth(): Promise<void> {
    await this.delegate.createPlan({ goal: 'health check' });
  }

  recordStepCompleted(task: PlanTask): void {
    this.recordLifecycleEvent({
      type: 'success',
      step: task.id,
      summary: `Planning step completed: ${task.objective}`,
      details: { taskId: task.id },
      createdAt: isoNow(),
    });
  }

  recordStepFailed(task: PlanTask, error: unknown): void {
    this.recordLifecycleEvent({
      type: 'failure',
      step: task.id,
      summary: `Planning step failed: ${task.objective}`,
      details: {
        taskId: task.id,
        errorName: error instanceof Error ? error.name : 'Error',
      },
      createdAt: isoNow(),
    });
  }

  private recordLifecycleEvent(event: EpisodicEvent): void {
    try {
      this.episodic.record(event);
    } catch {
      // Lifecycle telemetry must not replace successful planner/execution behavior.
    }
  }
}
