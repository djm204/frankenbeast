import type { BeastDefinition, BeastRun, BeastRunEvent, ModuleConfig } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus, BeastSseEvent } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import { normalizeBeastRunConfig, type BeastExecutors } from './beast-dispatch-service.js';
import { SAFE_DISPATCH_FAILURE_MESSAGE } from './dispatch-failure-message.js';
import { BeastCatalogService } from './beast-catalog-service.js';
import { isoNow } from '@franken/types';
import {
  CapacityReservationError,
  type CapacityReservationPolicy,
  type CapacityReservationWorkItem,
  capacityItemFromConfig,
} from './capacity-reservation-policy.js';
import type { MaintenanceModeService } from './maintenance-mode-service.js';

export interface BeastRunServiceOptions {
  eventBus?: BeastEventBus;
  capacityPolicy?: CapacityReservationPolicy | undefined;
  maintenance?: MaintenanceModeService | undefined;
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
    const redactedAgentIds = new Set(this.repository.listDispatchFailureHistoryAgentIds());
    return this.repository.listRuns().map((run) => (
      run.trackedAgentId && redactedAgentIds.has(run.trackedAgentId)
        ? { ...run, configSnapshot: {} }
        : run
    ));
  }

  getRun(runId: string): BeastRun | undefined {
    return this.repository.getRun(runId);
  }

  sanitizeRunForResponse(run: BeastRun | undefined): BeastRun | undefined {
    if (!run?.trackedAgentId || !this.repository.hasDispatchFailureHistory(run.trackedAgentId)) {
      return run;
    }
    return { ...run, configSnapshot: {} };
  }

  updateConfigSnapshot(runId: string, configSnapshot: Readonly<Record<string, unknown>>): BeastRun {
    return this.repository.updateRun(runId, { configSnapshot });
  }

  listAttempts(runId: string) {
    const run = this.requireRun(runId);
    const attempts = this.repository.listAttempts(runId);
    if (!this.hasDispatchFailureHistory(run)) return attempts;
    return attempts.map((attempt) => ({ ...attempt, executorMetadata: undefined }));
  }

  listEvents(runId: string) {
    const run = this.requireRun(runId);
    if (!this.hasDispatchFailureHistory(run)) return this.repository.listEvents(runId);
    return this.repository.listEvents(runId).map(redactDispatchFailureEvent);
  }

  async readLogs(runId: string): Promise<string[]> {
    const run = this.requireRun(runId);
    const attemptId = run.currentAttemptId;
    const lines = await this.logs.read(run.id, attemptId ?? 'system');
    if (!this.hasDispatchFailureHistory(run)) return lines;
    return lines.map(redactDispatchFailureLogLine);
  }

  async start(runId: string, _actor: string): Promise<BeastRun> {
    this.serviceOptions.maintenance?.assertDispatchAllowed();
    let run = this.requireRun(runId);
    const definition = this.getDefinitionOrThrow(run.definitionId);
    const rebuiltConfig = this.rebuildFailedTrackedRunConfig(run, definition);
    run = this.reserveTrackedAgentCapacityForStart(run, rebuiltConfig);
    if (rebuiltConfig) {
      run = this.persistRebuiltTrackedRunConfig(run, rebuiltConfig);
    }
    const priorAttemptId = run.currentAttemptId;
    const priorAttemptCount = run.attemptCount;
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
    } catch {
      const errorMessage = SAFE_DISPATCH_FAILURE_MESSAGE;
      const currentRun = this.repository.getRun(run.id);
      if (
        currentRun
        && (
          (currentRun.currentAttemptId !== undefined && currentRun.currentAttemptId !== priorAttemptId)
          || currentRun.attemptCount > priorAttemptCount
        )
      ) {
        if (currentRun.status === 'failed' && currentRun.trackedAgentId) {
          this.repository.updateRun(currentRun.id, { configSnapshot: {} });
        }
        throw new Error(SAFE_DISPATCH_FAILURE_MESSAGE);
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
        throw new Error(SAFE_DISPATCH_FAILURE_MESSAGE);
      }
      if (currentRun?.status === 'failed' && currentRun.finishedAt && currentRun.finishedAt !== run.finishedAt) {
        const failedAt = currentRun.finishedAt;
        await this.appendLogSafely(run.id, 'system', 'stderr', `start_failed: ${errorMessage}`);
        const { failedRun, publications } = this.repository.transaction(() => {
          const normalizedRun = this.repository.updateRun(run.id, {
            ...(run.trackedAgentId ? { configSnapshot: {} } : {}),
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
              }
              if (!this.repository.hasActiveDispatchFailure(normalizedRun.trackedAgentId)) {
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
          ...(run.trackedAgentId ? { configSnapshot: {} } : {}),
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
      if (run.status === 'completed' || run.status === 'failed' || run.status === 'stopped') {
        return run;
      }
      return this.stop(runId, _actor);
    }
    await this.executorFor(run).kill(run.id, attemptId);
    const updated = this.requireRun(runId);
    this.syncTrackedAgent(updated);
    return updated;
  }

  async restart(runId: string, actor: string): Promise<BeastRun> {
    this.serviceOptions.maintenance?.assertDispatchAllowed();
    const run = this.requireRun(runId);
    if (run.status === 'running') {
      this.assertTrackedAgentCapacity(run);
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

  private rebuildFailedTrackedRunConfig(
    run: BeastRun,
    definition: BeastDefinition,
  ): Readonly<Record<string, unknown>> | undefined {
    if (!run.trackedAgentId) return undefined;
    if (run.status !== 'failed' && !(run.status === 'stopped' && this.hasActiveDispatchFailure(run))) {
      return undefined;
    }
    const trackedAgent = this.repository.getTrackedAgent(run.trackedAgentId);
    if (!trackedAgent) return undefined;

    let normalized: Readonly<Record<string, unknown>>;
    try {
      normalized = normalizeBeastRunConfig(definition, trackedAgent.initConfig);
    } catch {
      // Pre-upgrade interview agents may have an empty tracked config while the
      // original failed run still holds the only valid completed answer set.
      normalized = normalizeBeastRunConfig(definition, run.configSnapshot);
    }
    const snapshotModules = run.configSnapshot.modules;
    const modules = snapshotModules && typeof snapshotModules === 'object' && !Array.isArray(snapshotModules)
      ? snapshotModules
      : trackedAgent.moduleConfig;
    return modules ? { ...normalized, modules } : normalized;
  }

  private persistRebuiltTrackedRunConfig(
    run: BeastRun,
    rebuiltConfig: Readonly<Record<string, unknown>>,
  ): BeastRun {
    return this.repository.transaction(() => {
      const updatedRun = this.repository.updateRun(run.id, { configSnapshot: rebuiltConfig });
      if (!run.trackedAgentId) return updatedRun;

      const trackedAgent = this.repository.getTrackedAgent(run.trackedAgentId);
      if (!trackedAgent || trackedAgent.status === 'deleted') return updatedRun;

      const { modules, ...normalizedInitConfig } = rebuiltConfig;
      const identity = trackedAgent.initConfig.identity;
      const initConfig = identity && typeof identity === 'object' && !Array.isArray(identity)
        ? { ...normalizedInitConfig, identity }
        : normalizedInitConfig;
      const moduleConfig = modules && typeof modules === 'object' && !Array.isArray(modules)
        ? modules as ModuleConfig
        : undefined;
      this.repository.updateTrackedAgent(run.trackedAgentId, {
        initConfig,
        ...(moduleConfig ? { moduleConfig } : {}),
      });
      return updatedRun;
    });
  }

  private hasActiveDispatchFailure(run: BeastRun): boolean {
    return Boolean(run.trackedAgentId && this.repository.hasActiveDispatchFailure(run.trackedAgentId));
  }

  private hasDispatchFailureHistory(run: BeastRun): boolean {
    return Boolean(run.trackedAgentId && this.repository.hasDispatchFailureHistory(run.trackedAgentId));
  }

  private assertTrackedAgentCapacity(
    run: BeastRun,
    configSnapshot: Readonly<Record<string, unknown>> = run.configSnapshot,
  ): void {
    if (!run.trackedAgentId || !this.serviceOptions.capacityPolicy) return;
    const trackedAgent = this.repository.getTrackedAgent(run.trackedAgentId);
    if (!trackedAgent || trackedAgent.status === 'deleted') return;

    const activeItems = this.activeCapacityItems(run.id);
    const decision = this.serviceOptions.capacityPolicy.canStart(
      capacityItemFromConfig(trackedAgent.id, configSnapshot),
      activeItems,
    );
    if (!decision.allowed) {
      throw new CapacityReservationError(decision, this.serviceOptions.capacityPolicy.describe(activeItems));
    }
  }

  private reserveTrackedAgentCapacityForStart(
    run: BeastRun,
    configSnapshot: Readonly<Record<string, unknown>> | undefined,
  ): BeastRun {
    if (!run.trackedAgentId || !this.serviceOptions.capacityPolicy) return run;
    const trackedAgent = this.repository.getTrackedAgent(run.trackedAgentId);
    if (!trackedAgent || trackedAgent.status === 'deleted') return run;

    const reservedAt = isoNow();
    return this.repository.transaction(() => {
      const currentRun = this.requireRun(run.id);
      const currentTrackedAgent = this.repository.getTrackedAgent(run.trackedAgentId!);
      if (!currentTrackedAgent || currentTrackedAgent.status === 'deleted') return currentRun;

      this.assertTrackedAgentCapacity(currentRun, configSnapshot ?? currentRun.configSnapshot);
      if (currentTrackedAgent.status === 'dispatching' && currentTrackedAgent.dispatchRunId === currentRun.id) {
        return currentRun;
      }

      this.repository.updateTrackedAgent(run.trackedAgentId!, {
        status: 'dispatching',
        dispatchRunId: currentRun.id,
        updatedAt: reservedAt,
      });
      return currentRun;
    });
  }

  private activeCapacityItems(excludeRunId: string): CapacityReservationWorkItem[] {
    return this.repository.listRuns()
      .filter(run => run.id !== excludeRunId)
      .filter(run => run.trackedAgentId)
      .filter(run => run.status === 'queued'
        || run.status === 'interviewing'
        || run.status === 'pending_approval'
        || run.status === 'running')
      .map(run => capacityItemFromConfig(run.trackedAgentId!, run.configSnapshot));
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

      if ((status === 'running' || status === 'awaiting_approval' || status === 'completed')
        && this.repository.hasUnrecoveredDispatchFailure(trackedAgentId)) {
        const recoveredEvent = {
          level: 'info' as const,
          type: 'agent.dispatch.recovered',
          message: `Tracked agent dispatch recovered for run ${run.id}`,
          payload: { runId: run.id },
          createdAt: updatedAt,
        };
        this.repository.appendTrackedAgentEvent(trackedAgentId, recoveredEvent);
        pendingPublications.push({
          type: 'agent.event',
          data: { agentId: trackedAgentId, event: recoveredEvent },
        });
      }

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

function redactDispatchFailureEvent(event: BeastRunEvent): BeastRunEvent {
  if (event.type !== 'run.start_failed' && event.type !== 'run.spawn_failed') return event;
  return {
    ...event,
    payload: { error: SAFE_DISPATCH_FAILURE_MESSAGE },
  };
}

function redactDispatchFailureLogLine(line: string): string {
  try {
    const record = JSON.parse(line) as unknown;
    if (record && typeof record === 'object' && !Array.isArray(record)) {
      const message = (record as { message?: unknown }).message;
      if (typeof message === 'string' && message.startsWith('start_failed:')) {
        return JSON.stringify({
          ...record,
          message: `start_failed: ${SAFE_DISPATCH_FAILURE_MESSAGE}`,
        });
      }
    }
  } catch {
    // Older stores may contain plain-text lines rather than JSON records.
  }
  return line.includes('start_failed:')
    ? `start_failed: ${SAFE_DISPATCH_FAILURE_MESSAGE}`
    : line;
}
