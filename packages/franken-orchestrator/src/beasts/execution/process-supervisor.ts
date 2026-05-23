import { type ChildProcess, spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { resolve, sep } from 'node:path';
import { createInterface } from 'node:readline';
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

    const maybeFireExit = () => {
      if (stdoutClosed && stderrClosed && exitInfo) {
        this.processes.delete(pid);
        callbacks.onExit(exitInfo.code, exitInfo.signal);
      }
    };

    if (child.stdout) {
      const stdoutRl = createInterface({ input: child.stdout });
      stdoutRl.on('line', (line) => callbacks.onStdout(line));
      stdoutRl.on('close', () => { stdoutClosed = true; maybeFireExit(); });
    } else {
      stdoutClosed = true;
    }

    if (child.stderr) {
      const stderrRl = createInterface({ input: child.stderr });
      stderrRl.on('line', (line) => callbacks.onStderr(line));
      stderrRl.on('close', () => { stderrClosed = true; maybeFireExit(); });
    } else {
      stderrClosed = true;
    }

    child.on('close', (code, signal) => {
      exitInfo = { code, signal };
      maybeFireExit();
    });

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
