import type { BeastDefinition, BeastDispatchSource, BeastExecutionMode, BeastRun } from '../types.js';
import { BeastLogStore } from '../events/beast-log-store.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastExecutor } from '../execution/beast-executor.js';
import type { BeastMetrics } from '../telemetry/beast-metrics.js';
import { BeastCatalogService } from './beast-catalog-service.js';

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
}

export class BeastDispatchService {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly catalog: BeastCatalogService,
    private readonly executors: BeastExecutors,
    private readonly metrics: BeastMetrics,
    private readonly logs: BeastLogStore,
  ) {}

  async createRun(request: CreateBeastRunRequest): Promise<BeastRun> {
    const definition = this.getDefinitionOrThrow(request.definitionId);
    const config = definition.configSchema.parse(request.config);
    const executionMode = request.executionMode ?? definition.executionModeDefault;

    if (request.trackedAgentId && !this.repository.getTrackedAgent(request.trackedAgentId)) {
      throw new Error(`Unknown tracked agent: ${request.trackedAgentId}`);
    }

    const run = this.repository.createRun({
      ...(request.trackedAgentId ? { trackedAgentId: request.trackedAgentId } : {}),
      definitionId: definition.id,
      definitionVersion: definition.version,
      executionMode,
      configSnapshot: config,
      dispatchedBy: request.dispatchedBy,
      dispatchedByUser: request.dispatchedByUser,
      createdAt: new Date().toISOString(),
    });

    this.repository.appendEvent(run.id, {
      type: 'run.created',
      payload: {
        definitionId: run.definitionId,
        executionMode,
        dispatchedBy: run.dispatchedBy,
      },
      createdAt: run.createdAt,
    });
    await this.logs.append(run.id, 'system', 'stdout', 'run created');
    this.metrics.recordRunCreated(run.definitionId, run.dispatchedBy);

    if (request.trackedAgentId) {
      this.repository.updateTrackedAgent(request.trackedAgentId, {
        status: 'dispatching',
        dispatchRunId: run.id,
        updatedAt: new Date().toISOString(),
      });
      this.repository.appendTrackedAgentEvent(request.trackedAgentId, {
        level: 'info',
        type: 'agent.dispatch.linked',
        message: `Linked Beast run ${run.id}`,
        payload: {
          runId: run.id,
        },
        createdAt: new Date().toISOString(),
      });
    }

    if (request.startNow) {
      await this.executorFor(executionMode).start(run, definition);
      const updated = this.repository.getRun(run.id);
      if (!updated) {
        throw new Error(`Beast run disappeared after start: ${run.id}`);
      }
      if (updated.trackedAgentId) {
        this.repository.updateTrackedAgent(updated.trackedAgentId, {
          status: updated.status === 'running' ? 'running' : 'dispatching',
          updatedAt: new Date().toISOString(),
        });
      }
      return updated;
    }

    return run;
  }

  private executorFor(mode: BeastExecutionMode): BeastExecutor {
    return mode === 'container' ? this.executors.container : this.executors.process;
  }

  private getDefinitionOrThrow(definitionId: string): BeastDefinition {
    const definition = this.catalog.getDefinition(definitionId);
    if (!definition) {
      throw new Error(`Unknown Beast definition: ${definitionId}`);
    }
    return definition;
  }
}
