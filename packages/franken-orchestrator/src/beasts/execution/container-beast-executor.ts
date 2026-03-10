import type { BeastExecutor } from './beast-executor.js';
import type { BeastDefinition, BeastRun, BeastRunAttempt } from '../types.js';

export class ContainerBeastExecutor implements BeastExecutor {
  async start(_run: BeastRun, _definition: BeastDefinition): Promise<BeastRunAttempt> {
    throw new Error('ContainerBeastExecutor is not implemented yet');
  }

  async stop(_runId: string, _attemptId: string): Promise<BeastRunAttempt> {
    throw new Error('ContainerBeastExecutor is not implemented yet');
  }

  async kill(_runId: string, _attemptId: string): Promise<BeastRunAttempt> {
    throw new Error('ContainerBeastExecutor is not implemented yet');
  }
}
