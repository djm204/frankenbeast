import type { Task, Intent, TaskStatus, PlanningStrategyName } from './types.js';

const VALID_STATUSES: ReadonlySet<string> = new Set<TaskStatus>([
  'pending',
  'in_progress',
  'completed',
  'failed',
  'skipped',
]);

const VALID_STRATEGIES: ReadonlySet<string> = new Set<PlanningStrategyName>([
  'linear',
  'parallel',
  'recursive',
]);

export function isTask(value: unknown): value is Task {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v['id'] !== 'string') return false;
  if (typeof v['objective'] !== 'string') return false;

  const skills = v['requiredSkills'];
  if (!Array.isArray(skills)) return false;
  if (!(skills as unknown[]).every((s) => typeof s === 'string')) return false;

  const deps = v['dependsOn'];
  if (!Array.isArray(deps)) return false;
  if (!(deps as unknown[]).every((d) => typeof d === 'string')) return false;

  if (typeof v['status'] !== 'string') return false;
  if (!VALID_STATUSES.has(v['status'])) return false;

  return true;
}

export function isIntent(value: unknown): value is Intent {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;

  if (typeof v['goal'] !== 'string') return false;

  if (v['strategy'] !== undefined) {
    if (typeof v['strategy'] !== 'string') return false;
    if (!VALID_STRATEGIES.has(v['strategy'])) return false;
  }

  return true;
}
