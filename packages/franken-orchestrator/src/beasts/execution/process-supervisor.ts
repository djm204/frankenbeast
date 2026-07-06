import { type ChildProcess, spawn } from 'node:child_process';
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
  stop(pid: number): Promise<void>;
  kill(pid: number): Promise<void>;
}

export interface ProcessSupervisorOptions {
  readonly projectRoot?: string | undefined;
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

  validateCwd(cwd: string | undefined): void {
    assertContainedCwd(this.options.projectRoot, cwd);
  }

  async spawn(
    spec: BeastProcessSpec,
    callbacks: ProcessCallbacks,
  ): Promise<SpawnedProcessHandle> {
    this.validateCwd(spec.cwd);

    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: {
        ...allowlistedEnv(process.env),
        ...spec.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error(
        `Failed to spawn Beast process for command: ${spec.command}`,
      );
    }

    const pid = child.pid;
    this.processes.set(pid, child);

    let stdoutClosed = false;
    let stderrClosed = false;
    let exitInfo: { code: number | null; signal: string | null } | undefined;
    let exitFired = false;

    const maybeFireExit = () => {
      if (!exitFired && stdoutClosed && stderrClosed && exitInfo) {
        exitFired = true;
        this.processes.delete(pid);
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

      const flushBufferedLine = () => {
        if (buffer.length > 0) {
          onLine(buffer);
          buffer = '';
        }
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
        const lines = buffer.split(/\r?\n/u);
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          onLine(line);
        }
      });
      stream.on('end', flushBufferedLine);
      stream.on('close', finish);

      return () => {
        finish();
        stream.destroy();
      };
    };

    const forceCloseStdout = child.stdout
      ? wireLineReader(child.stdout, callbacks.onStdout, markStdoutClosed)
      : undefined;
    if (!forceCloseStdout) {
      stdoutClosed = true;
    }

    const forceCloseStderr = child.stderr
      ? wireLineReader(child.stderr, callbacks.onStderr, markStderrClosed)
      : undefined;
    if (!forceCloseStderr) {
      stderrClosed = true;
    }

    const recordExit = (code: number | null, signal: string | null) => {
      exitInfo = { code, signal };
      setImmediate(() => {
        if (!stdoutClosed) {
          forceCloseStdout?.();
        }
        if (!stderrClosed) {
          forceCloseStderr?.();
        }
        maybeFireExit();
      });
    };

    child.on('exit', recordExit);
    child.on('close', recordExit);

    return { pid };
  }

  async stop(pid: number): Promise<void> {
    if (pid <= 0) {
      return;
    }

    const child = this.processes.get(pid);
    if (child) {
      child.kill('SIGTERM');
      return;
    }

    // Fallback to PID-based kill for legacy/external processes
    try {
      process.kill(pid, 'SIGTERM');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        throw error;
      }
    }
  }

  async kill(pid: number): Promise<void> {
    if (pid <= 0) {
      return;
    }

    const child = this.processes.get(pid);
    if (child) {
      child.kill('SIGKILL');
      return;
    }

    // Fallback to PID-based kill for legacy/external processes
    try {
      process.kill(pid, 'SIGKILL');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ESRCH') {
        throw error;
      }
    }
  }
}
