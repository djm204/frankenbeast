import { mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastExecutor, StopOptions } from './beast-executor.js';
import type { ProcessSupervisorLike } from './process-supervisor.js';
import type { BeastDefinition, BeastRun, BeastRunAttempt, BeastRunStatus, ModuleConfig } from '../types.js';

const STDERR_BUFFER_SIZE = 50;

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

export interface ProcessBeastExecutorOptions {
  onRunStatusChange?: (runId: string) => void;
  eventBus?: BeastEventBus;
  defaultStopTimeoutMs?: number;
}

export class ProcessBeastExecutor implements BeastExecutor {
  private readonly exitPromises = new Map<string, { resolve: () => void }>();
  private readonly configFilePaths = new Map<string, string>();

  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly logs: BeastLogStore,
    private readonly supervisor: ProcessSupervisorLike,
    private readonly options: ProcessBeastExecutorOptions = {},
  ) {}

  async start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt> {
    const processSpec = definition.buildProcessSpec(run.configSnapshot);
    const moduleEnv = moduleConfigToEnv(run.configSnapshot.modules as ModuleConfig | undefined);

    // Write configSnapshot to a JSON file for the spawned process to load
    const configDir = join(
      process.cwd(),
      '.frankenbeast',
      '.build',
      'run-configs',
    );
    mkdirSync(configDir, { recursive: true });
    const configFilePath = join(configDir, `${run.id}.json`);
    writeFileSync(configFilePath, JSON.stringify(run.configSnapshot, null, 2));
    this.configFilePaths.set(run.id, configFilePath);

    const mergedSpec = {
      ...processSpec,
      env: {
        ...processSpec.env,
        ...moduleEnv,
        FRANKENBEAST_RUN_CONFIG: configFilePath,
      },
    };

    let attemptId: string | undefined;
    const earlyStdoutLines: string[] = [];
    const earlyStderrLines: string[] = [];
    const stderrTail: string[] = [];
    let earlyExit: { code: number | null; signal: string | null } | undefined;

    let handle: { pid: number };
    try {
      handle = await this.supervisor.spawn(mergedSpec, {
        onStdout: (line) => {
          if (attemptId) {
            void this.logs.append(run.id, attemptId, 'stdout', line);
            this.options.eventBus?.publish({
              type: 'run.log',
              data: { runId: run.id, attemptId, stream: 'stdout', line },
            });
          } else {
            earlyStdoutLines.push(line);
          }
        },
        onStderr: (line) => {
          stderrTail.push(line);
          if (stderrTail.length > STDERR_BUFFER_SIZE) stderrTail.shift();
          if (attemptId) {
            void this.logs.append(run.id, attemptId, 'stderr', line);
            this.options.eventBus?.publish({
              type: 'run.log',
              data: { runId: run.id, attemptId, stream: 'stderr', line },
            });
          } else {
            earlyStderrLines.push(line);
          }
        },
        onExit: (code, signal) => {
          if (attemptId) {
            this.handleProcessExit(run.id, attemptId, code, signal, [...stderrTail]);
          } else {
            earlyExit = { code, signal };
          }
        },
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      const errorCode = (error as NodeJS.ErrnoException).code;
      const failedAt = new Date().toISOString();

      this.repository.updateRun(run.id, {
        status: 'failed',
        finishedAt: failedAt,
        stopReason: 'spawn_failed',
      });

      this.repository.appendEvent(run.id, {
        type: 'run.spawn_failed',
        payload: {
          error: errorMessage,
          ...(errorCode ? { code: errorCode } : {}),
          command: processSpec.command,
          args: [...processSpec.args],
        },
        createdAt: failedAt,
      });

      // Clean up config file written before spawn
      const configPath = this.configFilePaths.get(run.id);
      if (configPath) {
        try { unlinkSync(configPath); } catch { /* already removed */ }
        this.configFilePaths.delete(run.id);
      }

      this.options.eventBus?.publish({
        type: 'run.status',
        data: { runId: run.id, status: 'failed' as const, updatedAt: failedAt },
      });

      this.options.onRunStatusChange?.(run.id);
      throw error;
    }

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

    attemptId = attempt.id;

    // Flush early buffered lines to logs and SSE
    for (const line of earlyStdoutLines) {
      void this.logs.append(run.id, attemptId, 'stdout', line);
      this.options.eventBus?.publish({
        type: 'run.log',
        data: { runId: run.id, attemptId, stream: 'stdout', line },
      });
    }
    for (const line of earlyStderrLines) {
      void this.logs.append(run.id, attemptId, 'stderr', line);
      this.options.eventBus?.publish({
        type: 'run.log',
        data: { runId: run.id, attemptId, stream: 'stderr', line },
      });
    }

    // Flush early exit if process died before attemptId was set
    if (earlyExit) {
      this.handleProcessExit(run.id, attemptId, earlyExit.code, earlyExit.signal, [...stderrTail]);
    }

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

  async stop(runId: string, attemptId: string, options?: StopOptions): Promise<BeastRunAttempt> {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.pid !== undefined) {
      await this.supervisor.stop(attempt.pid);

      {
        const timeoutMs = options?.timeoutMs ?? this.options.defaultStopTimeoutMs ?? 10_000;
        const pid = attempt.pid;
        const exitPromise = new Promise<boolean>((resolve) => {
          this.exitPromises.set(attemptId, { resolve: () => resolve(true) });
        });

        let timer: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        });

        const exited = await Promise.race([exitPromise, timeoutPromise]);
        clearTimeout(timer!);

        if (!exited && this.exitPromises.has(attemptId)) {
          this.exitPromises.delete(attemptId);
          await this.supervisor.kill(pid);
        }

        // If process exited naturally, handleProcessExit already updated status — don't overwrite
        if (exited) {
          return this.repository.getAttempt(attemptId) ?? attempt;
        }
      }
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

  private handleProcessExit(
    runId: string,
    attemptId: string,
    code: number | null,
    signal: string | null,
    stderrTail: string[],
  ): void {
    // Skip if attempt is already in a terminal state (e.g., finishAttempt already ran from stop/kill)
    const currentAttempt = this.repository.getAttempt(attemptId);
    if (currentAttempt && (currentAttempt.status === 'stopped' || currentAttempt.status === 'completed' || currentAttempt.status === 'failed')) {
      // Still resolve any pending exit promise so stop() doesn't hang
      const exitEntry = this.exitPromises.get(attemptId);
      if (exitEntry) {
        this.exitPromises.delete(attemptId);
        exitEntry.resolve();
      }
      // Still clean up config file
      const configPath = this.configFilePaths.get(runId);
      if (configPath) {
        try { unlinkSync(configPath); } catch { /* already removed */ }
        this.configFilePaths.delete(runId);
      }
      return;
    }

    const status: BeastRunStatus = code === 0 ? 'completed' : 'failed';
    const stopReason = code === 0 ? undefined : signal ? `signal_${signal}` : code != null ? `exit_code_${code}` : 'unknown_exit';
    const finishedAt = new Date().toISOString();

    this.repository.updateAttempt(attemptId, {
      status,
      finishedAt,
      exitCode: code ?? undefined,
      ...(stopReason ? { stopReason } : {}),
    });

    this.repository.updateRun(runId, {
      status,
      finishedAt,
      latestExitCode: code ?? undefined,
      ...(stopReason ? { stopReason } : {}),
    });

    const eventType = code === 0 ? 'attempt.finished' : 'attempt.failed';
    this.repository.appendEvent(runId, {
      attemptId,
      type: eventType,
      payload: {
        exitCode: code,
        signal,
        ...(code !== 0 ? { lastStderrLines: stderrTail, summary: `Process exited with code ${code}` } : {}),
      },
      createdAt: finishedAt,
    });

    const exitEntry = this.exitPromises.get(attemptId);
    if (exitEntry) {
      this.exitPromises.delete(attemptId);
      exitEntry.resolve();
    }

    // Clean up config file
    const configPath = this.configFilePaths.get(runId);
    if (configPath) {
      try { unlinkSync(configPath); } catch { /* already removed */ }
      this.configFilePaths.delete(runId);
    }

    this.options.eventBus?.publish({
      type: 'run.status',
      data: { runId, status, updatedAt: finishedAt },
    });

    this.options.onRunStatusChange?.(runId);
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

    this.options.eventBus?.publish({
      type: 'run.status',
      data: { runId, status, updatedAt: finishedAt },
    });

    this.options.onRunStatusChange?.(runId);
    return updatedAttempt;
  }
}
