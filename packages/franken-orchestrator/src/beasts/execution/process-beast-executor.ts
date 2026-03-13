import { BeastLogStore } from '../events/beast-log-store.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastExecutor } from './beast-executor.js';
import type { ProcessSupervisorLike } from './process-supervisor.js';
import type { BeastDefinition, BeastRun, BeastRunAttempt, ModuleConfig } from '../types.js';

function moduleConfigToEnv(config?: ModuleConfig): Record<string, string> {
  if (!config) return {};
  const env: Record<string, string> = {};
  const keys: (keyof ModuleConfig)[] = ['firewall', 'skills', 'memory', 'planner', 'critique', 'governor', 'heartbeat'];
  for (const key of keys) {
    if (config[key] !== undefined) {
      env[`FRANKENBEAST_MODULE_${key.toUpperCase()}`] = String(config[key]);
    }
  }
  return env;
}

export class ProcessBeastExecutor implements BeastExecutor {
  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly logs: BeastLogStore,
    private readonly supervisor: ProcessSupervisorLike,
  ) {}

  async start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt> {
    const processSpec = definition.buildProcessSpec(run.configSnapshot);
    const moduleEnv = moduleConfigToEnv(run.configSnapshot.modules as ModuleConfig | undefined);
    const mergedSpec = {
      ...processSpec,
      env: { ...processSpec.env, ...moduleEnv },
    };
    const handle = await this.supervisor.spawn(mergedSpec);
    const startedAt = new Date().toISOString();
    const attempt = this.repository.createAttempt(run.id, {
      status: 'running',
      pid: handle.pid,
      startedAt,
      executorMetadata: {
        backend: 'process',
        command: processSpec.command,
        args: [...processSpec.args],
      },
    });

    this.repository.appendEvent(run.id, {
      attemptId: attempt.id,
      type: 'attempt.started',
      payload: {
        pid: handle.pid,
        command: processSpec.command,
      },
      createdAt: startedAt,
    });
    await this.logs.append(run.id, attempt.id, 'stdout', `started pid=${handle.pid}`);
    return attempt;
  }

  async stop(runId: string, attemptId: string): Promise<BeastRunAttempt> {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.pid !== undefined) {
      await this.supervisor.stop(attempt.pid);
    }
    return this.finishAttempt(runId, attempt, 'stopped', 'operator_stop');
  }

  async kill(runId: string, attemptId: string): Promise<BeastRunAttempt> {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.pid !== undefined) {
      await this.supervisor.kill(attempt.pid);
    }
    return this.finishAttempt(runId, attempt, 'stopped', 'operator_kill');
  }

  private requireAttempt(attemptId: string): BeastRunAttempt {
    const attempt = this.repository.getAttempt(attemptId);
    if (!attempt) {
      throw new Error(`Unknown Beast attempt: ${attemptId}`);
    }
    return attempt;
  }

  private finishAttempt(
    runId: string,
    attempt: BeastRunAttempt,
    status: BeastRunAttempt['status'],
    stopReason: string,
  ): BeastRunAttempt {
    const finishedAt = new Date().toISOString();
    const updatedAttempt = this.repository.updateAttempt(attempt.id, {
      status,
      finishedAt,
      stopReason,
    });
    this.repository.updateRun(runId, {
      status,
      finishedAt,
      stopReason,
    });
    this.repository.appendEvent(runId, {
      attemptId: attempt.id,
      type: status === 'stopped' ? 'attempt.stopped' : 'attempt.finished',
      payload: {
        stopReason,
      },
      createdAt: finishedAt,
    });
    void this.logs.append(runId, attempt.id, 'stderr', stopReason);
    return updatedAttempt;
  }
}
