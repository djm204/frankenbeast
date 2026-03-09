import { spawn as nodeSpawn, type ChildProcess, type SpawnOptions } from 'node:child_process';
import type { IAdapter } from './adapter-llm-client.js';
import type { ICliProvider } from '../skills/providers/cli-provider.js';

type CliTransformed = { prompt: string; maxTurns: number };

type SpawnFn = (
  command: string,
  args: readonly string[],
  options: SpawnOptions,
) => ChildProcess;

export interface CliLlmAdapterOpts {
  workingDir: string;
  timeoutMs?: number;
  commandOverride?: string;
  /** Called with each complete line of stdout as it arrives (for streaming progress). */
  onStreamLine?: (line: string) => void;
}

export class CliLlmAdapter implements IAdapter {
  private readonly provider: ICliProvider;
  private readonly opts: { workingDir: string; timeoutMs: number; commandOverride?: string; onStreamLine?: (line: string) => void };
  private readonly _spawn: SpawnFn;

  constructor(
    provider: ICliProvider,
    opts: CliLlmAdapterOpts,
    _spawnFn?: SpawnFn,
  ) {
    this.provider = provider;
    this.opts = {
      workingDir: opts.workingDir,
      timeoutMs: opts.timeoutMs ?? 120_000,
      ...(opts.commandOverride !== undefined ? { commandOverride: opts.commandOverride } : {}),
      ...(opts.onStreamLine !== undefined ? { onStreamLine: opts.onStreamLine } : {}),
    };
    this._spawn = _spawnFn ?? (nodeSpawn as SpawnFn);
  }

  transformRequest(request: unknown): CliTransformed {
    const req = request as {
      messages: Array<{ role: string; content: string }>;
    };
    const userMessages = req.messages.filter((m) => m.role === 'user');
    const last = userMessages[userMessages.length - 1];
    return { prompt: last?.content ?? '', maxTurns: 1 };
  }

  async execute(providerRequest: unknown): Promise<string> {
    const { prompt, maxTurns } = providerRequest as CliTransformed;
    const cmd = this.opts.commandOverride ?? this.provider.command;

    const args = this.provider.buildArgs({ maxTurns });
    args.push(prompt);

    const rawEnv: Record<string, string> = {};
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined) rawEnv[key] = value;
    }
    const env = this.provider.filterEnv(rawEnv);

    return new Promise<string>((resolve, reject) => {
      const child = this._spawn(cmd, args, {
        stdio: ['ignore', 'pipe', 'pipe'],
        cwd: this.opts.workingDir,
        env,
      });

      let stdout = '';
      let stderr = '';
      let settled = false;
      let lineBuffer = '';

      const settle = (fn: () => void): void => {
        if (settled) return;
        settled = true;
        fn();
      };

      child.stdout!.on('data', (chunk: Buffer) => {
        const text = chunk.toString();
        stdout += text;

        if (this.opts.onStreamLine) {
          lineBuffer += text;
          const lines = lineBuffer.split('\n');
          // Keep the last (possibly incomplete) segment in the buffer
          lineBuffer = lines.pop()!;
          for (const line of lines) {
            if (line.trim().length > 0) {
              this.opts.onStreamLine(line);
            }
          }
        }
      });

      child.stderr!.on('data', (chunk: Buffer) => {
        stderr += chunk.toString();
      });

      const timer = setTimeout(() => {
        child.kill('SIGTERM');
        const killTimer = setTimeout(() => {
          try { child.kill('SIGKILL'); } catch { /* already dead */ }
        }, 5_000);
        killTimer.unref();
        settle(() => reject(new Error(`CLI timeout after ${this.opts.timeoutMs}ms`)));
      }, this.opts.timeoutMs);

      child.on('close', (code) => {
        clearTimeout(timer);
        // Flush remaining line buffer
        if (this.opts.onStreamLine && lineBuffer.trim().length > 0) {
          this.opts.onStreamLine(lineBuffer);
        }
        if (code !== 0) {
          settle(() => reject(new Error(`CLI exited with code ${code}: ${stderr}`)));
        } else {
          settle(() => resolve(stdout));
        }
      });

      child.on('error', (err) => {
        clearTimeout(timer);
        settle(() => reject(err));
      });
    });
  }

  transformResponse(providerResponse: unknown, _requestId: string): { content: string | null } {
    const raw = providerResponse as string;
    if (!raw) return { content: '' };
    const normalized = this.provider.normalizeOutput(raw);
    return { content: normalized };
  }

  validateCapabilities(feature: string): boolean {
    return feature === 'text-completion';
  }
}
