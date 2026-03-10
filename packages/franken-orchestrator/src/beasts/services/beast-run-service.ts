import type { BeastDefinition, BeastRun } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import type { BeastExecutors } from './beast-dispatch-service.js';
import { BeastCatalogService } from './beast-catalog-service.js';

export class BeastRunService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly catalog: BeastCatalogService,
    private readonly executors: BeastExecutors,
    private readonly metrics: BeastMetrics,
    private readonly logs: BeastLogStore,
  ) {}

  listRuns(): BeastRun[] {
    return this.repository.listRuns();
  }

  getRun(runId: string): BeastRun | undefined {
    return this.repository.getRun(runId);
  }

  async stop(runId: string, _actor: string): Promise<BeastRun> {
    const run = this.requireRun(runId);
    const attemptId = run.currentAttemptId;
    if (!attemptId) {
      throw new Error(`Beast run has no active attempt: ${runId}`);
    }
    await this.executorFor(run).stop(run.id, attemptId);
    this.metrics.recordRunStopped(run.definitionId);
    await this.logs.append(run.id, attemptId, 'stderr', 'operator_stop');
    return this.requireRun(runId);
  }

  private executorFor(run: BeastRun) {
    return run.executionMode === 'container'
      ? this.executors.container
      : this.executors.process;
  }

  private requireRun(runId: string): BeastRun {
    const run = this.repository.getRun(runId);
    if (!run) {
      throw new Error(`Unknown Beast run: ${runId}`);
    }
    this.getDefinitionOrThrow(run.definitionId);
    return run;
  }

  private getDefinitionOrThrow(definitionId: string): BeastDefinition {
    const definition = this.catalog.getDefinition(definitionId);
    if (!definition) {
      throw new Error(`Unknown Beast definition: ${definitionId}`);
    }
    return definition;
  }
}
