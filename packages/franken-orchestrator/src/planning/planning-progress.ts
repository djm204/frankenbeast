export type PlanningStage =
  | 'gathering-context'
  | 'decomposing'
  | 'validating'
  | 'remediating'
  | 'revalidating'
  | 'writing-chunks';

export type PlanningStageStatus = 'started' | 'completed' | 'skipped';

export interface PlanningProgressEvent {
  readonly stage: PlanningStage;
  readonly status: PlanningStageStatus;
  readonly position: number;
  readonly total: number;
  readonly message: string;
  readonly nextStage?: string;
  readonly chunks?: number;
  readonly errors?: number;
  readonly warnings?: number;
}

export type PlanningProgressListener = (event: PlanningProgressEvent) => void;

export const PLANNING_STAGE_TOTAL = 6;

export const PLANNING_STAGE_LABELS: Readonly<Record<PlanningStage, string>> = {
  'gathering-context': 'Context gathering',
  decomposing: 'Decomposition',
  validating: 'Validation',
  remediating: 'Remediation',
  revalidating: 'Re-validation',
  'writing-chunks': 'Chunk writing',
};
