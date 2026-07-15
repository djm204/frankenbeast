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
      return this.logs.read(run.id, 'system');
    }
    return this.logs.read(run.id, attemptId);
  }

  async start(runId: string, _actor: string): Promise<BeastRun> {
    const run = this.requireRun(runId);
    const definition = this.getDefinitionOrThrow(run.definitionId);
    const priorAttemptId = run.currentAttemptId;
    const priorAttemptCount = run.attemptCount;
    const trackedAgentStatusBeforeStart = run.trackedAgentId
      ? this.repository.getTrackedAgent(run.trackedAgentId)?.status
      : undefined;
    try {
      await this.executorFor(run).start(run, definition);
      let updated = this.requireRun(runId);
      if (
        updated.status === 'running'
        && (updated.finishedAt !== undefined || updated.stopReason !== undefined || updated.latestExitCode !== undefined)
      ) {
        updated = this.repository.updateRun(runId, {
          finishedAt: null,
          latestExitCode: null,
          stopReason: null,
        });
      }
      this.syncTrackedAgent(updated);
      return updated;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const currentRun = this.repository.getRun(run.id);
      if (
        currentRun
        && (
          (currentRun.currentAttemptId !== undefined && currentRun.currentAttemptId !== priorAttemptId)
          || currentRun.attemptCount > priorAttemptCount
        )
      ) {
        throw error;
      }
      const priorAttempt = priorAttemptId ? this.repository.getAttempt(priorAttemptId) : undefined;
      if (priorAttempt?.status === 'running') {
        const restoredRun = this.repository.updateRun(run.id, {
          status: run.status,
          startedAt: run.startedAt ?? priorAttempt.startedAt,
          finishedAt: run.finishedAt ?? null,
          currentAttemptId: priorAttemptId,
          latestExitCode: run.latestExitCode ?? null,
          stopReason: run.stopReason ?? null,
        });
        this.syncTrackedAgent(restoredRun);
        throw error;
      }
      if (currentRun?.status === 'failed' && currentRun.finishedAt && currentRun.finishedAt !== run.finishedAt) {
        const failedAt = currentRun.finishedAt;
        await this.appendLogSafely(run.id, 'system', 'stderr', `start_failed: ${errorMessage}`);
        const { failedRun, publications } = this.repository.transaction(() => {
          const normalizedRun = this.repository.updateRun(run.id, {
            startedAt: null,
            currentAttemptId: null,
            latestExitCode: null,
          });
          const pendingPublications: Array<Omit<BeastSseEvent, 'id'>> = [];
          if (normalizedRun.trackedAgentId) {
            const trackedAgent = this.repository.getTrackedAgent(normalizedRun.trackedAgentId);
            if (trackedAgent && trackedAgent.status !== 'deleted') {
              const failedEvent = {
                level: 'error' as const,
                type: 'agent.dispatch.failed',
                message: `Failed to start Beast run ${normalizedRun.id}`,
                payload: { runId: normalizedRun.id, error: errorMessage },
                createdAt: failedAt,
              };
              if (trackedAgent.status !== 'failed') {
                this.repository.updateTrackedAgent(normalizedRun.trackedAgentId, {
                  status: 'failed',
                  dispatchRunId: normalizedRun.id,
                  updatedAt: failedAt,
                });
                pendingPublications.push({
                  type: 'agent.status',
                  data: { agentId: normalizedRun.trackedAgentId, status: 'failed', updatedAt: failedAt },
                });
                this.repository.appendTrackedAgentEvent(normalizedRun.trackedAgentId, failedEvent);
                pendingPublications.push({
                  type: 'agent.event',
                  data: { agentId: normalizedRun.trackedAgentId, event: failedEvent },
                });
              } else if (trackedAgentStatusBeforeStart === 'failed') {
                this.repository.appendTrackedAgentEvent(normalizedRun.trackedAgentId, failedEvent);
                pendingPublications.push({
                  type: 'agent.event',
                  data: { agentId: normalizedRun.trackedAgentId, event: failedEvent },
                });
              }
            }
          }
          return { failedRun: normalizedRun, publications: pendingPublications };
        });
        for (const publication of publications) {
          this.serviceOptions.eventBus?.publish(publication);
        }
        return failedRun;
      }

      const failedAt = isoNow();
      const { failedRun, publications } = this.repository.transaction(() => {
        const updatedRun = this.repository.updateRun(run.id, {
          status: 'failed',
          startedAt: null,
          finishedAt: failedAt,
          currentAttemptId: null,
          latestExitCode: null,
          stopReason: 'start_failed',
        });
        const startFailedEvent = this.repository.appendEvent(run.id, {
          type: 'run.start_failed',
          payload: { error: errorMessage },
          createdAt: failedAt,
        });

        const pendingPublications: Array<Omit<BeastSseEvent, 'id'>> = [
          {
            type: 'run.event',
            data: { runId: run.id, event: startFailedEvent },
          },
          {
            type: 'run.status',
            data: { runId: run.id, status: 'failed', updatedAt: failedAt },
          },
        ];
        if (updatedRun.trackedAgentId) {
          const trackedAgent = this.repository.getTrackedAgent(updatedRun.trackedAgentId);
          if (trackedAgent && trackedAgent.status !== 'deleted') {
            this.repository.updateTrackedAgent(updatedRun.trackedAgentId, {
              status: 'failed',
              dispatchRunId: updatedRun.id,
              updatedAt: failedAt,
            });
            pendingPublications.push({
              type: 'agent.status',
              data: { agentId: updatedRun.trackedAgentId, status: 'failed', updatedAt: failedAt },
            });
            const failedEvent = {
              level: 'error' as const,
              type: 'agent.dispatch.failed',
              message: `Failed to start Beast run ${updatedRun.id}`,
              payload: { runId: updatedRun.id, error: errorMessage },
              createdAt: failedAt,
            };
            this.repository.appendTrackedAgentEvent(updatedRun.trackedAgentId, failedEvent);
            pendingPublications.push({
              type: 'agent.event',
              data: { agentId: updatedRun.trackedAgentId, event: failedEvent },
            });
          }
        }

        return { failedRun: updatedRun, publications: pendingPublications };
      });
      await this.appendLogSafely(run.id, 'system', 'stderr', `start_failed: ${errorMessage}`);
      for (const publication of publications) {
        this.serviceOptions.eventBus?.publish(publication);
      }
      return failedRun;
    }
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
      const cleanedPendingRun = await this.executorFor(run).cleanupPendingRun?.(run.id) ?? false;
      if (cleanedPendingRun) {
        return this.stop(runId, _actor);
      }
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

  private async appendLogSafely(
    runId: string,
    attemptId: string,
    stream: 'stdout' | 'stderr',
    message: string,
  ): Promise<void> {
    try {
      await this.logs.append(runId, attemptId, stream, message);
    } catch {
      // Logging is best-effort and must not turn a persisted run into an API failure.
    }
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
      : run.status === 'pending_approval'
        ? 'awaiting_approval'
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
