import {
  GovernorCritiqueAdapter,
  type BudgetStateSource,
  type GovernorCritiqueAdapterDeps,
  type SkillMetadataSource,
} from './governor-critique-adapter.js';
import { GovernorAuditRecorder } from '../audit/audit-recorder.js';
import { CliChannel, type ReadlineAdapter } from '../channels/cli-channel.js';
import type { GovernorMemoryPort } from '../audit/governor-memory-port.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import { defaultConfig, type GovernorConfig } from '../core/config.js';

export interface CreateGovernorOptions {
  readonly readline: ReadlineAdapter;
  readonly memoryPort: GovernorMemoryPort;
  readonly evaluators?: ReadonlyArray<TriggerEvaluator>;
  readonly projectId?: string;
  readonly operatorName?: string;
  readonly config?: Partial<GovernorConfig>;
  /** Skill governance flags for SkillTrigger contexts (e.g. a skill registry). */
  readonly skillMetadata?: SkillMetadataSource;
  /** Budget circuit-breaker state for BudgetTrigger contexts (e.g. MOD-05). */
  readonly budgetState?: BudgetStateSource;
}

export function createGovernor(options: CreateGovernorOptions): GovernorCritiqueAdapter {
  const config: GovernorConfig = {
    ...defaultConfig(),
    ...options.config,
  };

  const channel = new CliChannel({
    readline: options.readline,
    operatorName: options.operatorName ?? config.operatorName,
  });

  const auditRecorder = new GovernorAuditRecorder(options.memoryPort);

  return new GovernorCritiqueAdapter({
    channel,
    auditRecorder,
    evaluators: options.evaluators ?? [],
    projectId: options.projectId ?? 'default',
    config,
    ...(options.skillMetadata ? { skillMetadata: options.skillMetadata } : {}),
    ...(options.budgetState ? { budgetState: options.budgetState } : {}),
  });
}
