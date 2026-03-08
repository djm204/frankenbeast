import { GovernorCritiqueAdapter, type GovernorCritiqueAdapterDeps } from './governor-critique-adapter.js';
import { GovernorAuditRecorder } from '../audit/audit-recorder.js';
import { CliChannel, type ReadlineAdapter } from '../channels/cli-channel.js';
import type { GovernorMemoryPort } from '../audit/governor-memory-port.js';
import type { TriggerEvaluator } from '../triggers/trigger-evaluator.js';
import { defaultConfig } from '../core/config.js';

export interface CreateGovernorOptions {
  readonly readline: ReadlineAdapter;
  readonly memoryPort: GovernorMemoryPort;
  readonly evaluators?: ReadonlyArray<TriggerEvaluator>;
  readonly projectId?: string;
  readonly operatorName?: string;
}

export function createGovernor(options: CreateGovernorOptions): GovernorCritiqueAdapter {
  const config = defaultConfig();

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
  });
}
