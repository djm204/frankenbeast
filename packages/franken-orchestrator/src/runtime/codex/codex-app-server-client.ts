import { spawn } from 'node:child_process';
import type { CodexAppServerRequest, CodexAppServerRequestOptions } from './codex-runtime-adapter.js';

export interface CodexAppServerClientOptions {
  command?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  maxOutputBytes?: number | undefined;
}

const DEFAULT_MAX_OUTPUT_BYTES = 2 * 1024 * 1024;
const STDERR_LIMIT_BYTES = 64 * 1024;

export function createCodexAppServerRequest(
  options: CodexAppServerClientOptions = {},
): CodexAppServerRequest {
  const command = options.command ?? 'codex';
  const env = options.env ?? process.env;
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;

  return async (
    method: string,
    params: Record<string, unknown>,
    requestOptions: CodexAppServerRequestOptions,
  ): Promise<unknown> => await new Promise((resolve, reject) => {
    if (!Number.isSafeInteger(requestOptions.timeoutMs) || requestOptions.timeoutMs < 1) {
      reject(new RangeError('Codex app-server timeout must be a positive integer'));
      return;
    }
    if (requestOptions.signal?.aborted) {
      const reason = requestOptions.signal.reason;
      reject(reason instanceof Error ? reason : new Error('Codex app-server request aborted'));
      return;
    }
    const child = spawn(command, ['app-server', '--stdio'], {
      env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let settled = false;
    let initialized = false;
    let buffered = '';
    let outputBytes = 0;
    let stderrBytes = 0;

    const finish = (error?: Error, value?: unknown): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      requestOptions.signal?.removeEventListener('abort', onAbort);
      child.stdin.end();
      child.kill();
      if (error) reject(error);
      else resolve(value);
    };
    function onAbort(): void {
      const reason = requestOptions.signal?.reason;
      finish(reason instanceof Error ? reason : new Error('Codex app-server request aborted'));
    }
    const timer = setTimeout(() => {
      finish(new Error('Codex app-server request timed out'));
    }, requestOptions.timeoutMs);

    requestOptions.signal?.addEventListener('abort', onAbort, { once: true });
    child.on('error', () => finish(new Error('Codex app-server is unavailable')));
    child.stdin.on('error', () => finish(new Error('Codex app-server is unavailable')));
    child.on('close', () => {
      if (!settled) finish(new Error('Codex app-server closed before responding'));
    });
    child.stderr.on('data', (chunk: Buffer | string) => {
      stderrBytes += Buffer.byteLength(chunk);
      if (stderrBytes > STDERR_LIMIT_BYTES) finish(new Error('Codex app-server diagnostic output exceeded the limit'));
    });
    child.stdout.on('data', (chunk: Buffer | string) => {
      outputBytes += Buffer.byteLength(chunk);
      if (outputBytes > maxOutputBytes) {
        finish(new Error('Codex app-server response exceeded the limit'));
        return;
      }
      buffered += chunk.toString();
      let newline = buffered.indexOf('\n');
      while (newline >= 0) {
        const line = buffered.slice(0, newline).trim();
        buffered = buffered.slice(newline + 1);
        newline = buffered.indexOf('\n');
        if (!line) continue;
        let message: Record<string, unknown>;
        try {
          const decoded = JSON.parse(line) as unknown;
          if (!decoded || typeof decoded !== 'object') continue;
          message = decoded as Record<string, unknown>;
        } catch {
          finish(new Error('Codex app-server returned malformed JSON'));
          return;
        }
        if (!initialized && message['id'] === 1) {
          if (message['error']) {
            finish(new Error('Codex app-server initialization failed'));
            return;
          }
          initialized = true;
          child.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
          child.stdin.write(`${JSON.stringify({ id: 2, method, params })}\n`);
        } else if (initialized && message['id'] === 2) {
          if (message['error']) finish(new Error('Codex app-server request failed'));
          else finish(undefined, message['result']);
          return;
        }
      }
    });

    child.stdin.write(`${JSON.stringify({
      id: 1,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'frankenbeast-smart-swarm',
          title: 'Frankenbeast Smart Swarm',
          version: '1.0.0',
        },
      },
    })}\n`);
  });
}
