import { spawn } from 'node:child_process';
import type { BeastProcessSpec } from '../types.js';

export interface SpawnedProcessHandle {
  readonly pid: number;
}

export interface ProcessSupervisorLike {
  spawn(spec: BeastProcessSpec): Promise<SpawnedProcessHandle>;
  stop(pid: number): Promise<void>;
  kill(pid: number): Promise<void>;
}

export class ProcessSupervisor implements ProcessSupervisorLike {
  async spawn(spec: BeastProcessSpec): Promise<SpawnedProcessHandle> {
    const child = spawn(spec.command, [...spec.args], {
      cwd: spec.cwd,
      env: {
        ...process.env,
        ...spec.env,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    if (!child.pid) {
      throw new Error(`Failed to spawn Beast process for command: ${spec.command}`);
    }

    return { pid: child.pid };
  }

  async stop(pid: number): Promise<void> {
    if (pid <= 0) {
      return;
    }
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
