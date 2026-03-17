import { type ChildProcess, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import type { BeastProcessSpec } from '../types.js';

export interface SpawnedProcessHandle {
  readonly pid: number;
}

export interface ProcessCallbacks {
  onStdout: (line: string) => void;
  onStderr: (line: string) => void;
  onExit: (code: number | null, signal: string | null) => void;
}

export interface ProcessSupervisorLike {
  spawn(spec: BeastProcessSpec, callbacks?: ProcessCallbacks): Promise<SpawnedProcessHandle>;
  stop(pid: number): Promise<void>;
  kill(pid: number): Promise<void>;
}

/**
 * Strip all CLAUDE* env vars from an env object to prevent plugin interference
 * in spawned processes.
 */
function stripClaudeEnvVars(
  env: NodeJS.ProcessEnv,
): Record<string, string | undefined> {
  const cleaned: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(env)) {
    if (!key.startsWith('CLAUDE')) {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

export class ProcessSupervisor implements ProcessSupervisorLike {
  private readonly processes = new Map<number, ChildProcess>();

  async spawn(
    spec: BeastProcessSpec,
    callbacks?: ProcessCallbacks,
  ): Promise<SpawnedProcessHandle> {
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: {
        ...stripClaudeEnvVars(process.env),
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

    if (callbacks) {
      if (child.stdout) {
        const stdoutRl = createInterface({ input: child.stdout });
        stdoutRl.on('line', (line) => callbacks.onStdout(line));
      }

      if (child.stderr) {
        const stderrRl = createInterface({ input: child.stderr });
        stderrRl.on('line', (line) => callbacks.onStderr(line));
      }

      child.on('close', (code, signal) => {
        this.processes.delete(pid);
        callbacks.onExit(code, signal);
      });
    } else {
      child.on('close', () => {
        this.processes.delete(pid);
      });
    }

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
