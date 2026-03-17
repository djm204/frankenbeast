import type { BeastDefinition, BeastRun } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import type { BeastExecutors } from './beast-dispatch-service.js';
import { BeastCatalogService } from './beast-catalog-service.js';

export interface BeastRunServiceOptions {
  eventBus?: BeastEventBus;
}

export class BeastRunService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly catalog: BeastCatalogService,
    private readonly executors: BeastExecutors,
    private readonly metrics: BeastMetrics,
    private readonly logs: BeastLogStore,
    private readonly serviceOptions: BeastRunServiceOptions = {},
  ) {}

  listRuns(): BeastRun[] {
    return this.repository.listRuns();
  }

  getRun(runId: string): BeastRun | undefined {
    return this.repository.getRun(runId);
  }

  listAttempts(runId: string) {
    this.requireRun(runId);
    return this.repository.listAttempts(runId);
  }

  listEvents(runId: string) {
    this.requireRun(runId);
    return this.repository.listEvents(runId);
  }

  async readLogs(runId: string): Promise<string[]> {
    const run = this.requireRun(runId);
    const attemptId = run.currentAttemptId;
    if (!attemptId) {
      return [];
    }
    return this.logs.read(run.id, attemptId);
  }

  async start(runId: string, _actor: string): Promise<BeastRun> {
    const run = this.requireRun(runId);
    const definition = this.getDefinitionOrThrow(run.definitionId);
    await this.executorFor(run).start(run, definition);
    const updated = this.requireRun(runId);
    this.syncTrackedAgent(updated);
    return updated;
  }

  async stop(runId: string, _actor: string): Promise<BeastRun> {
    const run = this.requireRun(runId);
    const attemptId = run.currentAttemptId;
    if (!attemptId) {
      const stoppedAt = new Date().toISOString();
      const updated = this.repository.transaction(() => {
        const stoppedRun = this.repository.updateRun(run.id, {
          status: 'stopped',
          finishedAt: stoppedAt,
          stopReason: 'operator_stop',
        });
        this.repository.appendEvent(run.id, {
          type: 'run.stopped',
          payload: {
            stopReason: 'operator_stop',
          },
          createdAt: stoppedAt,
        });
        return stoppedRun;
      });
      this.metrics.recordRunStopped(run.definitionId);
      this.syncTrackedAgent(updated);
      return updated;
    }
    await this.executorFor(run).stop(run.id, attemptId);
    this.metrics.recordRunStopped(run.definitionId);
    await this.logs.append(run.id, attemptId, 'stderr', 'operator_stop');
    const updated = this.requireRun(runId);
    this.syncTrackedAgent(updated);
    return updated;
  }

  async kill(runId: string, _actor: string): Promise<BeastRun> {
    const run = this.requireRun(runId);
    const attemptId = run.currentAttemptId;
    if (!attemptId) {
      throw new Error(`Beast run has no active attempt: ${runId}`);
    }
    await this.executorFor(run).kill(run.id, attemptId);
    await this.logs.append(run.id, attemptId, 'stderr', 'operator_kill');
    const updated = this.requireRun(runId);
    this.syncTrackedAgent(updated);
    return updated;
  }

  async restart(runId: string, actor: string): Promise<BeastRun> {
    const run = this.requireRun(runId);
    if (run.status === 'running') {
      await this.stop(runId, actor);
    }
    return this.start(runId, actor);
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

  notifyRunStatusChange(runId: string): void {
    const run = this.repository.getRun(runId);
    if (run) {
      this.syncTrackedAgent(run);
    }
  }

  private syncTrackedAgent(run: BeastRun): void {
    if (!run.trackedAgentId) {
      return;
    }
    const trackedAgent = this.repository.getTrackedAgent(run.trackedAgentId);
    if (!trackedAgent || trackedAgent.status === 'deleted') {
      return;
    }

    const status = run.status === 'running'
      ? 'running'
      : run.status === 'completed'
        ? 'completed'
        : run.status === 'failed'
          ? 'failed'
          : 'stopped';

    const updatedAt = new Date().toISOString();
    this.repository.updateTrackedAgent(run.trackedAgentId, {
      status,
      ...(run.id ? { dispatchRunId: run.id } : {}),
      updatedAt,
    });

    this.serviceOptions.eventBus?.publish({
      type: 'agent.status',
      data: { agentId: run.trackedAgentId, status, updatedAt },
    });

    // Only append agent event if transitioning to a terminal state (avoid duplicates)
    if ((run.status === 'failed' || run.status === 'completed' || run.status === 'stopped')
      && trackedAgent.status !== status) {
      const level = run.status === 'failed' ? 'error' : 'info';
      const type = `agent.run.${run.status}`;
      const message = run.status === 'failed'
        ? `Run ${run.id} failed with exit code ${run.latestExitCode ?? 'unknown'}`
        : run.status === 'completed'
          ? `Run ${run.id} completed successfully`
          : `Run ${run.id} stopped`;
      this.repository.appendTrackedAgentEvent(run.trackedAgentId, {
        level,
        type,
        message,
        payload: {
          runId: run.id,
          ...(run.latestExitCode !== undefined ? { exitCode: run.latestExitCode } : {}),
          ...(run.stopReason ? { stopReason: run.stopReason } : {}),
        },
        createdAt: new Date().toISOString(),
      });
    }
  }
}
