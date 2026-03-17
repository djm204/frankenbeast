import type { BeastDefinition, BeastDispatchSource, BeastExecutionMode, BeastRun, ModuleConfig } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastExecutor } from '../execution/beast-executor.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import { BeastCatalogService } from './beast-catalog-service.js';

export interface BeastDispatchServiceOptions {
  eventBus?: BeastEventBus;
}

export interface BeastExecutors {
  readonly process: BeastExecutor;
  readonly container: BeastExecutor;
}

export interface CreateBeastRunRequest {
  readonly definitionId: string;
  readonly config: Readonly<Record<string, unknown>>;
  readonly dispatchedBy: BeastDispatchSource;
  readonly dispatchedByUser: string;
  readonly trackedAgentId?: string | undefined;
  readonly executionMode?: BeastExecutionMode | undefined;
  readonly startNow?: boolean | undefined;
  readonly moduleConfig?: ModuleConfig | undefined;
}

export class BeastDispatchService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly catalog: BeastCatalogService,
    private readonly executors: BeastExecutors,
    private readonly metrics: BeastMetrics,
    private readonly logs: BeastLogStore,
    private readonly options: BeastDispatchServiceOptions = {},
  ) {}

  async createRun(request: CreateBeastRunRequest): Promise<BeastRun> {
    const definition = this.getDefinitionOrThrow(request.definitionId);
    const config = definition.configSchema.parse(request.config);
    const moduleConfig = request.moduleConfig ?? this.resolveAgentModuleConfig(request.trackedAgentId);
    const configSnapshot: Readonly<Record<string, unknown>> = moduleConfig
      ? { ...config, modules: moduleConfig }
      : config;
    const executionMode = request.executionMode ?? definition.executionModeDefault;
    const createdAt = new Date().toISOString();
    const linkedAt = new Date().toISOString();
    const run = this.repository.transaction(() => {
      if (request.trackedAgentId) {
        this.repository.requireTrackedAgent(request.trackedAgentId);
      }

      const createdRun = this.repository.createRun({
        ...(request.trackedAgentId ? { trackedAgentId: request.trackedAgentId } : {}),
        definitionId: definition.id,
        definitionVersion: definition.version,
        executionMode,
        configSnapshot,
        dispatchedBy: request.dispatchedBy,
        dispatchedByUser: request.dispatchedByUser,
        createdAt,
      });

      this.repository.appendEvent(createdRun.id, {
        type: 'run.created',
        payload: {
          definitionId: createdRun.definitionId,
          executionMode,
          dispatchedBy: createdRun.dispatchedBy,
        },
        createdAt: createdRun.createdAt,
      });

      if (request.trackedAgentId) {
        this.repository.updateTrackedAgent(request.trackedAgentId, {
          status: 'dispatching',
          dispatchRunId: createdRun.id,
          updatedAt: linkedAt,
        });
        this.repository.appendTrackedAgentEvent(request.trackedAgentId, {
          level: 'info',
          type: 'agent.dispatch.linked',
          message: `Linked Beast run ${createdRun.id}`,
          payload: {
            runId: createdRun.id,
          },
          createdAt: linkedAt,
        });
      }

      return createdRun;
    });

    await this.appendLogSafely(run.id, 'system', 'stdout', 'run created');
    this.metrics.recordRunCreated(run.definitionId, run.dispatchedBy);

    if (request.startNow) {
      try {
        await this.executorFor(executionMode).start(run, definition);
        const updated = this.repository.getRun(run.id);
        if (!updated) {
          throw new Error(`Beast run disappeared after start: ${run.id}`);
        }
        if (updated.trackedAgentId) {
          const agentStatus = updated.status === 'running' ? 'running' : 'dispatching';
          const updatedAt = new Date().toISOString();
          this.repository.updateTrackedAgent(updated.trackedAgentId, {
            status: agentStatus,
            updatedAt,
          });
          this.options.eventBus?.publish({
            type: 'agent.status',
            data: { agentId: updated.trackedAgentId, status: agentStatus, updatedAt },
          });
        }
        return updated;
      } catch (error) {
        const failedAt = new Date().toISOString();
        const errorMessage = error instanceof Error ? error.message : String(error);
        const failedRun = this.repository.transaction(() => {
          const updatedRun = this.repository.updateRun(run.id, {
            status: 'failed',
            finishedAt: failedAt,
            stopReason: 'start_failed',
          });
          this.repository.appendEvent(run.id, {
            type: 'run.start_failed',
            payload: {
              error: errorMessage,
            },
            createdAt: failedAt,
          });
          if (updatedRun.trackedAgentId) {
            this.repository.updateTrackedAgent(updatedRun.trackedAgentId, {
              status: 'failed',
              updatedAt: failedAt,
            });
            this.options.eventBus?.publish({
              type: 'agent.status',
              data: { agentId: updatedRun.trackedAgentId, status: 'failed', updatedAt: failedAt },
            });
            this.repository.appendTrackedAgentEvent(updatedRun.trackedAgentId, {
              level: 'error',
              type: 'agent.dispatch.failed',
              message: `Failed to start Beast run ${updatedRun.id}`,
              payload: {
                runId: updatedRun.id,
                error: errorMessage,
              },
              createdAt: failedAt,
            });
          }
          return updatedRun;
        });
        await this.appendLogSafely(run.id, 'system', 'stderr', `start_failed: ${errorMessage}`);
        return failedRun;
      }
    }

    return run;
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

  private executorFor(mode: BeastExecutionMode): BeastExecutor {
    return mode === 'container' ? this.executors.container : this.executors.process;
  }

  private resolveAgentModuleConfig(trackedAgentId?: string): ModuleConfig | undefined {
    if (!trackedAgentId) return undefined;
    const agent = this.repository.getTrackedAgent(trackedAgentId);
    return agent?.moduleConfig;
  }

  private getDefinitionOrThrow(definitionId: string): BeastDefinition {
    const definition = this.catalog.getDefinition(definitionId);
    if (!definition) {
      throw new Error(`Unknown Beast definition: ${definitionId}`);
    }
    return definition;
  }
}
