import { cpSync, existsSync, mkdirSync, writeFileSync, unlinkSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { BeastLogStore } from '../events/beast-log-store.js';
import type { BeastEventBus } from '../events/beast-event-bus.js';
import { SQLiteBeastRepository } from '../repository/sqlite-beast-repository.js';
import type { BeastExecutor, StopOptions } from './beast-executor.js';
import {
  createBeastWorktree,
  removeBeastWorktree,
  type BeastWorktreeAllocation,
  type GitWorktreeIsolationConfig,
} from './git-worktree-isolation.js';
import type { ProcessSupervisorLike } from './process-supervisor.js';
import type { BeastDefinition, BeastProcessSpec, BeastRun, BeastRunAttempt, BeastRunStatus, ModuleConfig } from '../types.js';

const STDERR_BUFFER_SIZE = 50;
const REDACTED_SECRET = '[REDACTED]';
const MIN_CONFIGURED_SECRET_LENGTH = 6;

const SENSITIVE_CONFIG_KEY_PATTERN = /(?:password|passwd|pwd|secret|clientsecret|token|apikey|accesskey|privatekey|auth|credential|webhookurl)/i;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function isConfiguredSecretKey(key: string): boolean {
  return SENSITIVE_CONFIG_KEY_PATTERN.test(key.replace(/[_\-.]/g, ''));
}

function addConfiguredSecretValue(secrets: Set<string>, value: unknown): void {
  if (typeof value !== 'string') return;
  const fragments = value.split(/\r?\n/);
  for (const fragment of fragments) {
    const trimmed = fragment.trim();
    if (trimmed.length >= MIN_CONFIGURED_SECRET_LENGTH) secrets.add(trimmed);
  }
}

function collectConfiguredSecretsFromObject(
  input: unknown,
  secrets: Set<string>,
  path: string[] = [],
): void {
  const currentPathIsSensitive = path.length > 0 && isConfiguredSecretKey(path.join('.'));
  if (currentPathIsSensitive) addConfiguredSecretValue(secrets, input);
  if (!input || typeof input !== 'object') return;
  if (Array.isArray(input)) {
    for (const item of input) collectConfiguredSecretsFromObject(item, secrets, path);
    return;
  }
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const nextPath = [...path, key];
    if (isConfiguredSecretKey(nextPath.join('.'))) {
      addConfiguredSecretValue(secrets, value);
    }
    collectConfiguredSecretsFromObject(value, secrets, nextPath);
  }
}

function collectConfiguredSecretValues(...sources: readonly unknown[]): readonly string[] {
  const secrets = new Set<string>();
  for (const source of sources) collectConfiguredSecretsFromObject(source, secrets);
  return [...secrets].sort((a, b) => b.length - a.length);
}

function redactConfiguredSecretValues(line: string, configuredSecrets: readonly string[]): string {
  let redacted = line;
  for (const secret of configuredSecrets) {
    redacted = redacted.replace(new RegExp(escapeRegExp(secret), 'g'), REDACTED_SECRET);
  }
  return redacted;
}

function redactBeastLogLine(line: string, configuredSecrets: readonly string[] = []): string {
  return redactConfiguredSecretValues(line, configuredSecrets)
    .replace(/((?:"|')?authorization(?:"|')?\s*:\s*(?:"|')?(?:bearer|basic|bot)\s+)[^\s"',;}]+/gi, `$1${REDACTED_SECRET}`)
    .replace(/(\bbearer\s+)[A-Za-z0-9._~+/-]+=*/gi, `$1${REDACTED_SECRET}`)
    .replace(/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g, REDACTED_SECRET)
    .replace(/\bgithub_pat_[A-Za-z0-9]{8,}_[A-Za-z0-9]{20,}_[A-Za-z0-9]{40,}\b/gi, REDACTED_SECRET)
    .replace(/\b(?:gh[opusr])_[A-Za-z0-9_.-]{20,}\b/gi, REDACTED_SECRET)
    .replace(/\bsk-[A-Za-z0-9_-]{15,}[A-Za-z0-9_-]\b/g, REDACTED_SECRET)
    .replace(/\bAIza[0-9A-Za-z_-]{35}\b/g, REDACTED_SECRET)
    .replace(/\bxoxb-(?:\d{10,}-){2}[A-Za-z0-9-]{19,}[A-Za-z0-9]\b/gi, REDACTED_SECRET)
    .replace(
      /((?:"|')?\b(?:[a-z0-9]+[_-])*(?:password|passwd|pwd|secret|client[_-]?secret|token|api[_-]?key|access[_-]?key|webhook[_-]?url|[a-z0-9]*(?:token|secret|password|apikey|accesskey|webhookurl))\b(?:"|')?\s*[=:]\s*)((?:"(?:\\.|[^"\\])*")|(?:'(?:\\.|[^'\\])*')|[^\s,;}]+)/gi,
      `$1${REDACTED_SECRET}`,
    )
    .replace(/([a-z][a-z0-9+.-]*:\/\/[^\s:/@]*:)[^\s@]+(@)/gi, `$1${REDACTED_SECRET}$2`)
    .replace(
      /https?:\/\/[^\s'"`<>]*(?:hooks\.slack\.com\/services|discord(?:app)?\.com\/api\/webhooks|webhook)[^\s'"`<>]*/gi,
      REDACTED_SECRET,
    );
}

function redactFailureStderrTail(stderrTail: readonly string[], configuredSecrets: readonly string[]): string[] {
  return stderrTail.map(line => redactBeastLogLine(line, configuredSecrets));
}

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

function remapRuntimePath(value: string, sourceRoot: string | undefined, targetRoot: string | undefined): string {
  if (!sourceRoot || !targetRoot) return value;
  const source = isAbsolute(value) ? resolve(value) : resolve(sourceRoot, value);
  const relativeSource = relative(resolve(sourceRoot), source);
  if (relativeSource.startsWith('..') || isAbsolute(relativeSource)) return value;
  const target = resolve(targetRoot, relativeSource);
  if (existsSync(source) && !existsSync(target)) {
    mkdirSync(dirname(target), { recursive: true });
    cpSync(source, target, { recursive: true });
  }
  return isAbsolute(value) ? target : value;
}

const RUNTIME_CONFIG_PATH_FIELDS = ['chunkDirectory', 'designDocPath', 'outputDir'] as const;
const RUNTIME_PATH_ARG_FLAGS = new Set(['--plan-dir', '--design-doc', '--output-dir']);

function remapRuntimeConfigSnapshot(
  configSnapshot: Readonly<Record<string, unknown>>,
  sourceRoot: string | undefined,
  targetRoot: string | undefined,
): Readonly<Record<string, unknown>> {
  let changed = false;
  const remapped: Record<string, unknown> = { ...configSnapshot };
  for (const key of RUNTIME_CONFIG_PATH_FIELDS) {
    const value = configSnapshot[key];
    if (typeof value !== 'string') continue;
    const remappedValue = remapRuntimePath(value, sourceRoot, targetRoot);
    if (remappedValue !== value) {
      remapped[key] = remappedValue;
      changed = true;
    }
  }
  return changed ? remapped : configSnapshot;
}

function remapRuntimePathArgs(
  args: readonly string[],
  sourceRoot: string | undefined,
  targetRoot: string | undefined,
): readonly string[] {
  return args.map((arg, index) => {
    const previous = index > 0 ? args[index - 1] : undefined;
    return previous && RUNTIME_PATH_ARG_FLAGS.has(previous)
      ? remapRuntimePath(arg, sourceRoot, targetRoot)
      : arg;
  });
}

export interface ProcessBeastExecutorOptions {
  onRunStatusChange?: (runId: string) => void;
  eventBus?: BeastEventBus;
  defaultStopTimeoutMs?: number;
  runConfigDir?: string;
  transformSpec?: (
    run: BeastRun,
    originalSpec: BeastProcessSpec,
    mergedSpec: BeastProcessSpec,
  ) => BeastProcessSpec;
  attemptMetadata?: (
    run: BeastRun,
    originalSpec: BeastProcessSpec,
    spawnedSpec: BeastProcessSpec,
    handle: { pid: number },
  ) => Readonly<Record<string, unknown>>;
  worktreeIsolation?: GitWorktreeIsolationConfig | undefined;
}

export class ProcessBeastExecutor implements BeastExecutor {
  private readonly exitPromises = new Map<string, { resolve: () => void }>();
  private readonly stoppingAttempts = new Set<string>();
  private readonly configFilePaths = new Map<string, string>();
  private readonly worktreeAllocations = new Map<string, BeastWorktreeAllocation>();

  constructor(
    private readonly repository: SQLiteBeastRepository,
    private readonly logs: BeastLogStore,
    private readonly supervisor: ProcessSupervisorLike,
    private readonly options: ProcessBeastExecutorOptions = {},
  ) {}

  async start(run: BeastRun, definition: BeastDefinition): Promise<BeastRunAttempt> {
    const processSpec = definition.buildProcessSpec(run.configSnapshot);
    const moduleEnv = moduleConfigToEnv(run.configSnapshot.modules as ModuleConfig | undefined);
    this.supervisor.validateCwd?.(processSpec.cwd);
    const worktree = run.trackedAgentId
      ? createBeastWorktree(
          this.options.worktreeIsolation,
          run.trackedAgentId,
          processSpec.cwd,
        )
      : undefined;
    if (worktree) {
      this.worktreeAllocations.set(run.id, worktree);
    }
    const isolatedConfigSnapshot = worktree
      ? remapRuntimeConfigSnapshot(run.configSnapshot, processSpec.cwd, worktree.executionCwd)
      : run.configSnapshot;
    const isolatedSpec = worktree
      ? {
          ...processSpec,
          args: remapRuntimePathArgs(processSpec.args, processSpec.cwd, worktree.executionCwd),
          cwd: worktree.executionCwd,
          env: {
            ...processSpec.env,
            FRANKENBEAST_WORKTREE_PATH: worktree.worktreePath,
            FRANKENBEAST_WORKTREE_BRANCH: worktree.branchName,
          },
        }
      : processSpec;

    // Write configSnapshot to a JSON file for the spawned process to load
    const configDir = resolve(
      this.options.runConfigDir ??
      join(isolatedSpec.cwd ?? process.env.FBEAST_ROOT ?? process.cwd(), '.fbeast', '.build', 'run-configs'),
    );
    mkdirSync(configDir, { recursive: true });
    const configFilePath = join(configDir, `${run.id}.json`);
    writeFileSync(configFilePath, JSON.stringify(isolatedConfigSnapshot, null, 2));
    this.configFilePaths.set(run.id, configFilePath);

    const mergedSpec = {
      ...isolatedSpec,
      env: {
        ...isolatedSpec.env,
        ...moduleEnv,
        FRANKENBEAST_RUN_CONFIG: configFilePath,
      },
    };
    const spawnedSpec = this.options.transformSpec?.(run, processSpec, mergedSpec) ?? mergedSpec;
    const configuredSecrets = collectConfiguredSecretValues(
      run.configSnapshot,
      processSpec.env,
      isolatedSpec.env,
      mergedSpec.env,
      spawnedSpec.env,
    );

    // eslint-disable-next-line prefer-const -- reassigned after attempt creation (line 162)
    let attemptId: string | undefined;
    const earlyStdoutLines: string[] = [];
    const earlyStderrLines: string[] = [];
    const stderrTail: string[] = [];
    let earlyExit: { code: number | null; signal: string | null } | undefined;

    let handle: { pid: number };
    try {
      handle = await this.supervisor.spawn(spawnedSpec, {
        onStdout: (line) => {
          const redactedLine = redactBeastLogLine(line, configuredSecrets);
          if (attemptId) {
            const createdAt = new Date().toISOString();
            void this.logs.append(run.id, attemptId, 'stdout', redactedLine, createdAt);
            this.options.eventBus?.publish({
              type: 'run.log',
              data: { runId: run.id, attemptId, stream: 'stdout', line: redactedLine, createdAt },
            });
          } else {
            earlyStdoutLines.push(redactedLine);
          }
        },
        onStderr: (line) => {
          const redactedLine = redactBeastLogLine(line, configuredSecrets);
          stderrTail.push(redactedLine);
          if (stderrTail.length > STDERR_BUFFER_SIZE) stderrTail.shift();
          if (attemptId) {
            const createdAt = new Date().toISOString();
            void this.logs.append(run.id, attemptId, 'stderr', redactedLine, createdAt);
            this.options.eventBus?.publish({
              type: 'run.log',
              data: { runId: run.id, attemptId, stream: 'stderr', line: redactedLine, createdAt },
            });
          } else {
            earlyStderrLines.push(redactedLine);
          }
        },
        onExit: (code, signal) => {
          if (attemptId) {
            this.handleProcessExit(run.id, attemptId, code, signal, [...stderrTail], configuredSecrets);
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

      const spawnFailedEvent = {
        type: 'run.spawn_failed' as const,
        payload: {
          error: errorMessage,
          ...(errorCode ? { code: errorCode } : {}),
          command: processSpec.command,
          args: [...processSpec.args],
        },
        createdAt: failedAt,
      };
      this.repository.appendEvent(run.id, spawnFailedEvent);
      this.options.eventBus?.publish({
        type: 'run.event',
        data: { runId: run.id, event: spawnFailedEvent },
      });

      // Clean up config file and worktree allocation written before spawn
      this.cleanupRunResources(run.id);

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
      executorMetadata: this.options.attemptMetadata?.(run, processSpec, spawnedSpec, handle) ?? {
        backend: 'process',
        command: processSpec.command,
        args: [...processSpec.args],
        ...(worktree
          ? {
              worktreeIsolation: true,
              worktreePath: worktree.worktreePath,
              worktreeBranch: worktree.branchName,
              worktreeCreated: worktree.created,
              worktreeAgentId: worktree.agentId,
              worktreeExecutionCwd: worktree.executionCwd,
              worktreeProjectRoot: worktree.projectRoot,
            }
          : {}),
      },
    });

    attemptId = attempt.id;

    // Flush early buffered lines to logs and SSE
    for (const line of earlyStdoutLines) {
      const createdAt = new Date().toISOString();
      void this.logs.append(run.id, attemptId, 'stdout', line, createdAt);
      this.options.eventBus?.publish({
        type: 'run.log',
        data: { runId: run.id, attemptId, stream: 'stdout', line, createdAt },
      });
    }
    for (const line of earlyStderrLines) {
      const createdAt = new Date().toISOString();
      void this.logs.append(run.id, attemptId, 'stderr', line, createdAt);
      this.options.eventBus?.publish({
        type: 'run.log',
        data: { runId: run.id, attemptId, stream: 'stderr', line, createdAt },
      });
    }

    // Flush early exit if process died before attemptId was set
    let flushedEarlyExit = false;
    if (earlyExit) {
      this.handleProcessExit(run.id, attemptId, earlyExit.code, earlyExit.signal, [...stderrTail], configuredSecrets);
      flushedEarlyExit = true;
    }

    const startedEvent = {
      attemptId: attempt.id,
      type: 'attempt.started' as const,
      payload: {
        pid: handle.pid,
        command: processSpec.command,
      },
      createdAt: startedAt,
    };
    this.repository.appendEvent(run.id, startedEvent);
    this.options.eventBus?.publish({
      type: 'run.event',
      data: { runId: run.id, event: startedEvent },
    });
    if (flushedEarlyExit) {
      return this.repository.getAttempt(attempt.id) ?? attempt;
    }
    this.options.eventBus?.publish({
      type: 'run.status',
      data: { runId: run.id, status: 'running' as const, updatedAt: startedAt },
    });
    const startLogLine = `started pid=${handle.pid}`;
    await this.logs.append(run.id, attempt.id, 'stdout', startLogLine, startedAt);
    this.options.eventBus?.publish({
      type: 'run.log',
      data: { runId: run.id, attemptId: attempt.id, stream: 'stdout', line: startLogLine, createdAt: startedAt },
    });
    return attempt;
  }

  async stop(runId: string, attemptId: string, options?: StopOptions): Promise<BeastRunAttempt> {
    const attempt = this.requireAttempt(attemptId);
    if (attempt.pid !== undefined) {
      const timeoutMs = options?.timeoutMs ?? this.options.defaultStopTimeoutMs ?? 10_000;
      const pid = attempt.pid;
      const exitPromise = new Promise<boolean>((resolve) => {
        this.exitPromises.set(attemptId, { resolve: () => resolve(true) });
      });

      this.stoppingAttempts.add(attemptId);
      try {
        await this.supervisor.stop(attempt.pid);
      } catch (error) {
        this.exitPromises.delete(attemptId);
        this.stoppingAttempts.delete(attemptId);
        throw error;
      }

      {
        let timer: ReturnType<typeof setTimeout>;
        const timeoutPromise = new Promise<boolean>((resolve) => {
          timer = setTimeout(() => resolve(false), timeoutMs);
        });

        const exited = await Promise.race([exitPromise, timeoutPromise]);
        clearTimeout(timer!);

        if (!exited && this.exitPromises.has(attemptId)) {
          this.exitPromises.delete(attemptId);
          this.stoppingAttempts.delete(attemptId);
          await this.supervisor.kill(pid);
        }

        // If process exited after an operator stop, handleProcessExit already updated status — don't overwrite
        if (exited) {
          return this.repository.getAttempt(attemptId) ?? attempt;
        }
      }
    }
    this.stoppingAttempts.delete(attemptId);
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
    configuredSecrets: readonly string[],
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
      this.cleanupRunResources(runId);
      return;
    }

    const status: BeastRunStatus = code === 0 ? 'completed' : 'failed';
    if (this.stoppingAttempts.delete(attemptId)) {
      this.finishAttempt(runId, currentAttempt ?? this.requireAttempt(attemptId), 'stopped', 'operator_stop');
      const exitEntry = this.exitPromises.get(attemptId);
      if (exitEntry) {
        this.exitPromises.delete(attemptId);
        exitEntry.resolve();
      }
      this.cleanupRunResources(runId);
      return;
    }

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
    const attemptRecord = this.repository.getAttempt(attemptId);
    const durationMs = attemptRecord?.startedAt
      ? new Date(finishedAt).getTime() - new Date(attemptRecord.startedAt).getTime()
      : undefined;
    const redactedStderrTail = code !== 0 ? redactFailureStderrTail(stderrTail, configuredSecrets) : [];
    const exitEvent = {
      attemptId,
      type: eventType,
      payload: {
        exitCode: code,
        signal,
        ...(durationMs !== undefined ? { durationMs } : {}),
        ...(code !== 0 ? { lastStderrLines: redactedStderrTail, summary: `Process exited with code ${code}` } : {}),
      },
      createdAt: finishedAt,
    };
    this.repository.appendEvent(runId, exitEvent);
    this.options.eventBus?.publish({
      type: 'run.event',
      data: { runId, event: exitEvent },
    });

    const exitEntry = this.exitPromises.get(attemptId);
    if (exitEntry) {
      this.exitPromises.delete(attemptId);
      exitEntry.resolve();
    }

    this.cleanupRunResources(runId);

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

  private cleanupRunResources(runId: string): void {
    const configPath = this.configFilePaths.get(runId);
    if (configPath) {
      try { unlinkSync(configPath); } catch { /* already removed */ }
      this.configFilePaths.delete(runId);
    }

    const worktree = this.worktreeAllocations.get(runId);
    if (worktree) {
      try { removeBeastWorktree(worktree, this.options.worktreeIsolation?.runGit); } catch { /* best effort */ }
      finally { this.worktreeAllocations.delete(runId); }
    }
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
    const finishEvent = {
      attemptId: attempt.id,
      type: (status === 'stopped' ? 'attempt.stopped' : 'attempt.finished') as string,
      payload: { stopReason },
      createdAt: finishedAt,
    };
    this.repository.appendEvent(runId, finishEvent);
    this.options.eventBus?.publish({
      type: 'run.event',
      data: { runId, event: finishEvent },
    });
    void this.logs.append(runId, attempt.id, 'stderr', stopReason, finishedAt);
    this.options.eventBus?.publish({
      type: 'run.log',
      data: { runId, attemptId: attempt.id, stream: 'stderr', line: stopReason, createdAt: finishedAt },
    });

    this.cleanupRunResources(runId);

    this.options.eventBus?.publish({
      type: 'run.status',
      data: { runId, status, updatedAt: finishedAt },
    });

    this.options.onRunStatusChange?.(runId);
    return updatedAttempt;
  }
}
