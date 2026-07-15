import { type ChildProcess, spawn as defaultSpawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import type { BeastProcessSpec } from '../types.js';
import { DEFAULT_BEAST_ENV_ALLOWLIST } from './sandbox-policy.js';

export interface SpawnedProcessHandle {
  readonly pid: number;
}

export interface ProcessCallbacks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

export interface ProcessSupervisorLike {
  validateCwd?(cwd: string | undefined): void;
  spawn(spec: BeastProcessSpec, callbacks: ProcessCallbacks): Promise<SpawnedProcessHandle>;
  stop(pid: number, options?: ProcessSignalOptions): Promise<void>;
  kill(pid: number, options?: ProcessSignalOptions): Promise<void>;
}

export interface ProcessSignalOptions {
  readonly processGroupOwned?: boolean | undefined;
}

export interface ProcessSupervisorOptions {
  readonly projectRoot?: string | undefined;
  readonly spawn?: typeof defaultSpawn;
  readonly orphanSweeper?: OrphanProcessSweeperOptions | undefined;
}

export interface OrphanProcessSweeperOptions {
  readonly enabled?: boolean | undefined;
  readonly signal?: NodeJS.Signals | undefined;
  readonly escalationDelayMs?: number | undefined;
  readonly platform?: NodeJS.Platform | undefined;
  readonly killProcess?: typeof process.kill | undefined;
}

export interface OrphanProcessSweepResult {
  readonly pid: number;
  readonly signal: NodeJS.Signals;
  readonly swept: boolean;
  readonly skippedReason?: 'disabled' | 'invalid_pid' | 'unsupported_platform' | 'no_process_group' | 'permission_denied' | undefined;
}

function allowlistedEnv(env: NodeJS.ProcessEnv): Record<string, string> {
  const cleaned: Record<string, string> = {};
  for (const key of DEFAULT_BEAST_ENV_ALLOWLIST) {
    const value = env[key];
    if (value !== undefined) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export function assertContainedCwd(projectRoot: string | undefined, cwd: string | undefined): void {
  if (!projectRoot || !cwd) {
    return;
  }

  const root = realpathSync(resolve(projectRoot));
  const target = realpathSync(resolve(cwd));
  if (target !== root && !target.startsWith(root + sep)) {
    throw new Error(`Refusing to spawn with cwd outside project root: ${cwd}`);
  }
}

export class ProcessSupervisor implements ProcessSupervisorLike {
  private readonly processes = new Map<number, ChildProcess>();

  constructor(private readonly options: ProcessSupervisorOptions = {}) {}

  private orphanSweeperEnabled(): boolean {
    return this.options.orphanSweeper?.enabled !== false;
  }

  private orphanSweeperPlatform(): NodeJS.Platform {
    return this.options.orphanSweeper?.platform ?? process.platform;
  }

  private orphanSweeperSignal(): NodeJS.Signals {
    return this.options.orphanSweeper?.signal ?? 'SIGTERM';
  }

  private killProcess(): typeof process.kill {
    return this.options.orphanSweeper?.killProcess ?? process.kill;
  }

  private orphanSweeperEscalationDelayMs(): number {
    return this.options.orphanSweeper?.escalationDelayMs ?? 1_000;
  }

  private shouldUseProcessGroup(): boolean {
    return this.orphanSweeperEnabled() && this.orphanSweeperPlatform() !== 'win32';
  }

  sweepOrphanProcessGroup(pid: number, signal: NodeJS.Signals = this.orphanSweeperSignal()): OrphanProcessSweepResult {
    if (!this.orphanSweeperEnabled()) {
      return { pid, signal, swept: false, skippedReason: 'disabled' };
    }
    if (pid <= 0) {
      return { pid, signal, swept: false, skippedReason: 'invalid_pid' };
    }
    if (this.orphanSweeperPlatform() === 'win32') {
      return { pid, signal, swept: false, skippedReason: 'unsupported_platform' };
    }

    try {
      this.killProcess()(-pid, signal);
      return { pid, signal, swept: true };
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code === 'ESRCH') {
        return { pid, signal, swept: false, skippedReason: 'no_process_group' };
      }
      if (code === 'EPERM') {
        return { pid, signal, swept: false, skippedReason: 'permission_denied' };
      }
      throw error;
    }
  }

  private scheduleOrphanKillEscalation(pid: number): void {
    const delayMs = this.orphanSweeperEscalationDelayMs();
    if (delayMs < 0 || !this.shouldUseProcessGroup() || pid <= 0) {
      return;
    }

    const timer = setTimeout(() => {
      this.sweepOrphanProcessGroup(pid, 'SIGKILL');
    }, delayMs);
    timer.unref?.();
  }

  validateCwd(cwd: string | undefined): void {
    assertContainedCwd(this.options.projectRoot, cwd);
  }

  async spawn(
    spec: BeastProcessSpec,
    callbacks: ProcessCallbacks,
  ): Promise<SpawnedProcessHandle> {
    this.validateCwd(spec.cwd);

    let stdoutClosed = false;
    let stderrClosed = false;
    let exitInfo: { code: number | null; signal: string | null } | undefined;
    let exitFired = false;
    let cleanupStarted = false;
    let setupError: Error | undefined;
    const forceClose = {
      stdout: undefined as (() => void) | undefined,
      stderr: undefined as (() => void) | undefined,
    };
    let recordExit: (code: number | null, signal: string | null) => void = () => undefined;

    const spawn = this.options.spawn ?? defaultSpawn;
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: {
        ...allowlistedEnv(process.env),
        ...spec.env,
      },
      detached: this.shouldUseProcessGroup(),
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    const cleanupProcess = () => {
      if (cleanupStarted) {
        return;
      }
      cleanupStarted = true;

      if (child.pid) {
        this.processes.delete(child.pid);
      }
      child.removeListener('error', onError);
      child.removeListener('exit', recordExit);
      child.removeListener('close', recordExit);
    };

    let maybeFireExit: () => void = () => undefined;

    const onError = (error: Error) => {
      setupError ??= error;
      callbacks.onStderr(`Process spawn failed for ${spec.command}: ${error.message}`);
      if (!exitInfo) {
        exitInfo = { code: 1, signal: null };
      }
      cleanupProcess();
      if (child.pid) {
        try {
          child.kill('SIGTERM');
        } catch (killError) {
          const killCode = (killError as NodeJS.ErrnoException).code;
          if (killCode !== 'ESRCH') {
            throw killError;
          }
        }
      }

      setImmediate(() => {
        if (!stdoutClosed) {
          if (!child.stdout) {
            stdoutClosed = true;
          }
          forceClose.stdout?.();
        }
        if (!stderrClosed) {
          if (!child.stderr) {
            stderrClosed = true;
          }
          forceClose.stderr?.();
        }
        maybeFireExit();
      });
    };

    child.once('error', onError);

    if (!child.pid) {
      await new Promise<void>((resolve) => setImmediate(resolve));
      cleanupProcess();
      throw setupError ?? new Error(
        `Failed to spawn Beast process for command: ${spec.command}`,
      );
    }

    const pid = child.pid;
    this.processes.set(pid, child);

    maybeFireExit = () => {
      if (!exitFired && stdoutClosed && stderrClosed && exitInfo) {
        cleanupProcess();
        exitFired = true;
        callbacks.onExit(exitInfo.code, exitInfo.signal);
      }
    };

    const markStdoutClosed = () => {
      stdoutClosed = true;
      maybeFireExit();
    };
    const markStderrClosed = () => {
      stderrClosed = true;
      maybeFireExit();
    };

    const wireLineReader = (
      stream: NonNullable<ChildProcess['stdout']>,
      onLine: (line: string) => void,
      markClosed: () => void,
    ) => {
      let buffer = '';
      let closed = false;

      let skipLfAfterCr = false;
      const flushBufferedLine = () => {
        if (buffer.length > 0) {
          onLine(buffer);
          buffer = '';
        }
      };
      const processBuffer = () => {
        let start = 0;
        if (skipLfAfterCr) {
          skipLfAfterCr = false;
          if (buffer[0] === '\n') {
            start = 1;
          }
        }
        for (let i = start; i < buffer.length; i += 1) {
          const char = buffer[i];
          if (char === '\n') {
            onLine(buffer.slice(start, i));
            start = i + 1;
            continue;
          }
          if (char === '\r') {
            onLine(buffer.slice(start, i));
            if (buffer[i + 1] === '\n') {
              i += 1;
            } else if (i + 1 >= buffer.length) {
              skipLfAfterCr = true;
            }
            start = i + 1;
          }
        }
        buffer = buffer.slice(start);
      };
      const finish = () => {
        if (closed) {
          return;
        }
        closed = true;
        flushBufferedLine();
        markClosed();
      };

      stream.setEncoding('utf8');
      stream.on('data', (chunk: string | Buffer) => {
        buffer += chunk.toString();
        processBuffer();
      });
      stream.on('end', flushBufferedLine);
      stream.on('close', finish);

      return () => {
        finish();
        stream.destroy();
      };
    };

    forceClose.stdout = child.stdout
      ? wireLineReader(child.stdout, callbacks.onStdout, markStdoutClosed)
      : undefined;
    if (!forceClose.stdout) {
      stdoutClosed = true;
    }

    forceClose.stderr = child.stderr
      ? wireLineReader(child.stderr, callbacks.onStderr, markStderrClosed)
      : undefined;
    if (!forceClose.stderr) {
      stderrClosed = true;
    }

    recordExit = (code: number | null, signal: string | null) => {
      exitInfo = { code, signal };
      if (this.sweepOrphanProcessGroup(pid).swept) {
        this.scheduleOrphanKillEscalation(pid);
      }
      setImmediate(() => {
        if (!stdoutClosed) {
          forceClose.stdout?.();
        }
        if (!stderrClosed) {
          forceClose.stderr?.();
        }
        maybeFireExit();
      });
    };

    child.on('exit', recordExit);
    child.on('close', recordExit);

    return { pid };
  }

  async stop(pid: number, options: ProcessSignalOptions = {}): Promise<void> {
    if (pid <= 0) {
      return;
    }

    const child = this.processes.get(pid);
    if (child) {
      this.signalTrackedProcess(child, pid, 'SIGTERM');
      return;
    }

    // Only process-group sweep recovered attempts that were persisted as
    // process-group leaders. Legacy/stale attempts fall back to direct PID
    // signaling so a reused PID cannot fan out to an unrelated group.
    try {
      if (!options.processGroupOwned || !this.sweepOrphanProcessGroup(pid, 'SIGTERM').swept) {
        this.killProcess()(pid, 'SIGTERM');
      } else {
        this.scheduleOrphanKillEscalation(pid);
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        throw error;
      }
    }
  }

  async kill(pid: number, options: ProcessSignalOptions = {}): Promise<void> {
    if (pid <= 0) {
      return;
    }

    const child = this.processes.get(pid);
    if (child) {
      this.signalTrackedProcess(child, pid, 'SIGKILL');
      return;
    }

    // Only process-group sweep recovered attempts that were persisted as
    // process-group leaders. Legacy/stale attempts fall back to direct PID
    // signaling so a reused PID cannot fan out to an unrelated group.
    try {
      if (!options.processGroupOwned || !this.sweepOrphanProcessGroup(pid, 'SIGKILL').swept) {
        this.killProcess()(pid, 'SIGKILL');
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        throw error;
      }
    }
  }

  private signalTrackedProcess(child: ChildProcess, pid: number, signal: NodeJS.Signals): void {
    const sweep = this.sweepOrphanProcessGroup(pid, signal);
    if (sweep.swept) {
      if (signal === 'SIGTERM') {
        this.scheduleOrphanKillEscalation(pid);
      }
      return;
    }
    child.kill(signal);
  }
}
