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

    let stdoutClosed = false;
    let stderrClosed = false;
    let exitInfo: { code: number | null; signal: string | null } | undefined;
    let exitFired = false;
    let cleanupStarted = false;
    let forceCloseStdout: (() => void) | undefined;
    let forceCloseStderr: (() => void) | undefined;
    let recordExit: (code: number | null, signal: string | null) => void = () => undefined;

    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: {
        ...allowlistedEnv(process.env),
        ...spec.env,
      },
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

    const onError = (error: Error) => {
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
          forceCloseStdout?.();
        }
        if (!stderrClosed) {
          if (!child.stderr) {
            stderrClosed = true;
          }
          forceCloseStderr?.();
        }
        maybeFireExit();
      });
    };

    child.once('error', onError);

    if (!child.pid) {
      throw new Error(
        `Failed to spawn Beast process for command: ${spec.command}`,
      );
    }

    const pid = child.pid;
    this.processes.set(pid, child);

    const maybeFireExit = () => {
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

    forceCloseStdout = child.stdout
      ? wireLineReader(child.stdout, callbacks.onStdout, markStdoutClosed)
      : undefined;
    if (!forceCloseStdout) {
      stdoutClosed = true;
    }

    forceCloseStderr = child.stderr
      ? wireLineReader(child.stderr, callbacks.onStderr, markStderrClosed)
      : undefined;
    if (!forceCloseStderr) {
      stderrClosed = true;
    }

    recordExit = (code: number | null, signal: string | null) => {
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
