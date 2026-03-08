/**
 * MOD-04 (Planner) contract — what MOD-08 requires from the planning system.
 */

export interface SelfImprovementTask {
  readonly description: string;
  readonly source: 'heartbeat';
  readonly priority: 'low' | 'medium' | 'high';
  readonly metadata?: Record<string, unknown>;
}

export interface IPlannerModule {
  injectTask(task: SelfImprovementTask): Promise<void>;
}
