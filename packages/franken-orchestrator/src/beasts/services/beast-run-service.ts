import type { BeastDefinition, BeastRun } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus, BeastSseEvent } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import type { BeastExecutors } from './beast-dispatch-service.js';
import { BeastCatalogService } from './beast-catalog-service.js';
import { isoNow } from '@franken/types';

export interface BeastRunServiceOptions {
  eventBus?: BeastEventBus;
}

export class UnknownBeastRunError extends Error {
  constructor(public readonly runId: string) {
    super(`Unknown Beast run: ${runId}`);
    this.name = 'UnknownBeastRunError';
  }
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

  updateConfigSnapshot(runId: string, configSnapshot: Readonly<Record<string, unknown>>): BeastRun {
    return this.repository.updateRun(runId, { configSnapshot });
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
      const stoppedAt = isoNow();
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
      throw new UnknownBeastRunError(runId);
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
    const trackedAgentId: string = run.trackedAgentId;
    const trackedAgent = this.repository.getTrackedAgent(trackedAgentId);
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

    // Skip all writes if status hasn't changed (full idempotency — prevents duplicate SSE, DB events, AND redundant updateTrackedAgent writes)
    if (trackedAgent.status === status) {
      return;
    }

    const updatedAt = isoNow();
    const publications = this.repository.transaction(() => {
      this.repository.updateTrackedAgent(trackedAgentId, {
        status,
        dispatchRunId: run.id,
        updatedAt,
      });

      const pendingPublications: Array<Omit<BeastSseEvent, 'id'>> = [{
        type: 'agent.status',
        data: { agentId: trackedAgentId, status, updatedAt },
      }];

      if ((run.status === 'failed' || run.status === 'completed' || run.status === 'stopped')) {
        const level: 'error' | 'info' = run.status === 'failed' ? 'error' : 'info';
        const type = `agent.run.${run.status}`;
        const message = run.status === 'failed'
          ? `Run ${run.id} failed with exit code ${run.latestExitCode ?? 'unknown'}`
          : run.status === 'completed'
            ? `Run ${run.id} completed successfully`
            : `Run ${run.id} stopped`;
        const agentEvent = {
          level,
          type,
          message,
          payload: {
            runId: run.id,
            ...(run.latestExitCode !== undefined ? { exitCode: run.latestExitCode } : {}),
            ...(run.stopReason ? { stopReason: run.stopReason } : {}),
          },
          createdAt: isoNow(),
        };
        this.repository.appendTrackedAgentEvent(trackedAgentId, agentEvent);
        pendingPublications.push({
          type: 'agent.event',
          data: { agentId: trackedAgentId, event: agentEvent },
        });
      }

      return pendingPublications;
    });

    for (const publication of publications) {
      this.serviceOptions.eventBus?.publish(publication);
    }
  }
}
