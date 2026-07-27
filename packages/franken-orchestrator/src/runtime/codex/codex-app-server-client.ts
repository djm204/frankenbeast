import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { StringDecoder } from 'node:string_decoder';
import type { CodexAppServerRequest, CodexAppServerRequestOptions } from './codex-runtime-adapter.js';

export interface CodexAppServerClientOptions {
  command?: string | undefined;
  env?: NodeJS.ProcessEnv | undefined;
  maxOutputBytes?: number | undefined;
  idleTimeoutMs?: number | undefined;
}

export class CodexProtocolError extends Error {
  constructor(readonly code: number) {
    super('Codex app-server protocol request failed');
    this.name = 'CodexProtocolError';
  }
}

interface PendingRequest {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
  signal?: AbortSignal | undefined;
  onAbort?: (() => void) | undefined;
}

const DEFAULT_MAX_OUTPUT_BYTES = 64 * 1024 * 1024;
const DEFAULT_IDLE_TIMEOUT_MS = 5_000;

function abortedError(signal: AbortSignal): Error {
  return signal.reason instanceof Error ? signal.reason : new Error('Codex app-server request aborted');
}

function safeError(message: string): Error {
  return new Error(message);
}

function protocolError(value: unknown, fallback: string): Error {
  const code = value && typeof value === 'object'
    ? (value as Record<string, unknown>)['code']
    : undefined;
  return typeof code === 'number' ? new CodexProtocolError(code) : safeError(fallback);
}

export function createCodexAppServerRequest(
  options: CodexAppServerClientOptions = {},
): CodexAppServerRequest {
  const command = options.command ?? 'codex';
  const maxOutputBytes = options.maxOutputBytes ?? DEFAULT_MAX_OUTPUT_BYTES;
  const idleTimeoutMs = options.idleTimeoutMs ?? DEFAULT_IDLE_TIMEOUT_MS;
  let child: ChildProcessWithoutNullStreams | null = null;
  let decoder = new StringDecoder('utf8');
  let buffered = '';
  let nextId = 1;
  let initializationId: number | null = null;
  let initialization: Promise<void> | null = null;
  let resolveInitialization: (() => void) | null = null;
  let rejectInitialization: ((error: Error) => void) | null = null;
  let initializationTimer: NodeJS.Timeout | null = null;
  let idleTimer: NodeJS.Timeout | null = null;
  const pending = new Map<number, PendingRequest>();

  const clearIdleTimer = (): void => {
    if (idleTimer !== null) clearTimeout(idleTimer);
    idleTimer = null;
  };

  const settlePending = (id: number, error: Error | null, value?: unknown): void => {
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (entry.signal && entry.onAbort) entry.signal.removeEventListener('abort', entry.onAbort);
    if (error) entry.reject(error);
    else entry.resolve(value);
    if (child !== null) scheduleIdleClose(child);
  };

  const closeCurrentServer = (server: ChildProcessWithoutNullStreams): void => {
    if (child !== server) return;
    child = null;
    initialization = null;
    initializationId = null;
    resolveInitialization = null;
    rejectInitialization = null;
    buffered = '';
    decoder = new StringDecoder('utf8');
    clearIdleTimer();
    if (server.exitCode === null) {
      server.kill('SIGTERM');
      const killTimer = setTimeout(() => {
        if (server.exitCode === null) server.kill('SIGKILL');
      }, 100);
      killTimer.unref();
    }
  };

  const failServer = (server: ChildProcessWithoutNullStreams, error: Error): void => {
    if (child !== server) return;
    if (initializationTimer !== null) clearTimeout(initializationTimer);
    initializationTimer = null;
    rejectInitialization?.(error);
    for (const id of [...pending.keys()]) settlePending(id, error);
    closeCurrentServer(server);
  };

  const scheduleIdleClose = (server: ChildProcessWithoutNullStreams): void => {
    if (pending.size > 0 || initializationId !== null || child !== server) return;
    clearIdleTimer();
    idleTimer = setTimeout(() => closeCurrentServer(server), idleTimeoutMs);
    idleTimer.unref();
  };

  const handleMessage = (server: ChildProcessWithoutNullStreams, message: unknown): void => {
    if (!message || typeof message !== 'object') return;
    const record = message as Record<string, unknown>;
    const id = typeof record['id'] === 'number' ? record['id'] : null;
    if (id === null) return;
    if (id === initializationId) {
      if (initializationTimer !== null) clearTimeout(initializationTimer);
      initializationTimer = null;
      initializationId = null;
      if (record['error'] !== undefined) {
        failServer(server, protocolError(record['error'], 'Codex app-server initialization failed'));
        return;
      }
      server.stdin.write(`${JSON.stringify({ method: 'initialized' })}\n`);
      resolveInitialization?.();
      resolveInitialization = null;
      rejectInitialization = null;
      scheduleIdleClose(server);
      return;
    }
    if (record['error'] !== undefined) {
      settlePending(id, protocolError(record['error'], 'Codex app-server request failed'));
    } else if (Object.hasOwn(record, 'result')) {
      settlePending(id, null, record['result']);
    }
    scheduleIdleClose(server);
  };

  const consumeOutput = (server: ChildProcessWithoutNullStreams, chunk: Buffer): void => {
    if (child !== server) return;
    buffered += decoder.write(chunk);
    let newline = buffered.indexOf('\n');
    while (newline >= 0) {
      const line = buffered.slice(0, newline).trim();
      buffered = buffered.slice(newline + 1);
      if (Buffer.byteLength(line) > maxOutputBytes) {
        failServer(server, safeError('Codex app-server response exceeded the bounded output limit'));
        return;
      }
      if (line) {
        try {
          handleMessage(server, JSON.parse(line) as unknown);
        } catch {
          failServer(server, safeError('Codex app-server returned invalid JSON'));
          return;
        }
      }
      newline = buffered.indexOf('\n');
    }
    if (Buffer.byteLength(buffered) > maxOutputBytes) {
      failServer(server, safeError('Codex app-server response exceeded the bounded output limit'));
    }
  };

  const flushOutput = (server: ChildProcessWithoutNullStreams): void => {
    buffered += decoder.end();
    const line = buffered.trim();
    buffered = '';
    if (!line) return;
    if (Buffer.byteLength(line) > maxOutputBytes) {
      failServer(server, safeError('Codex app-server response exceeded the bounded output limit'));
      return;
    }
    try {
      handleMessage(server, JSON.parse(line) as unknown);
    } catch {
      failServer(server, safeError('Codex app-server returned invalid JSON'));
    }
  };

  const ensureServer = (timeoutMs: number): Promise<void> => {
    if (child !== null && initialization !== null) return initialization;
    const server = spawn(command, ['app-server', '--stdio'], {
      env: options.env ?? process.env,
      shell: false,
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    child = server;
    server.unref();
    for (const stream of [server.stdin, server.stdout, server.stderr]) {
      const unref = (stream as { unref?: () => void }).unref;
      unref?.call(stream);
    }
    decoder = new StringDecoder('utf8');
    buffered = '';
    initialization = new Promise<void>((resolve, reject) => {
      resolveInitialization = resolve;
      rejectInitialization = reject;
    });
    const currentInitialization = initialization;
    initializationId = nextId;
    nextId += 1;

    server.stdout.on('data', (chunk: Buffer) => consumeOutput(server, chunk));
    server.stderr.on('data', () => undefined);
    server.stdin.on('error', () => failServer(server, safeError('Codex app-server input failed')));
    server.on('error', () => failServer(server, safeError('Codex app-server is unavailable')));
    server.on('close', () => {
      if (child !== server) return;
      flushOutput(server);
      failServer(server, safeError('Codex app-server closed before responding'));
    });

    initializationTimer = setTimeout(() => {
      failServer(server, safeError('Codex app-server initialization timed out'));
    }, timeoutMs);
    server.stdin.write(`${JSON.stringify({
      id: initializationId,
      method: 'initialize',
      params: {
        clientInfo: {
          name: 'frankenbeast-smart-swarm',
          title: 'Frankenbeast Smart Swarm',
          version: '0.60.0',
        },
      },
    })}\n`);
    return currentInitialization;
  };

  const awaitInitialization = async (
    promise: Promise<void>,
    signal: AbortSignal | undefined,
  ): Promise<void> => {
    if (!signal) return await promise;
    if (signal.aborted) throw abortedError(signal);
    await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        const onAbort = (): void => reject(abortedError(signal));
        signal.addEventListener('abort', onAbort, { once: true });
        const removeAbortListener = (): void => signal.removeEventListener('abort', onAbort);
        void promise.then(removeAbortListener, removeAbortListener);
      }),
    ]);
  };

  return async (
    method: string,
    params: Record<string, unknown>,
    requestOptions: CodexAppServerRequestOptions,
  ): Promise<unknown> => {
    if (!Number.isSafeInteger(requestOptions.timeoutMs) || requestOptions.timeoutMs <= 0) {
      throw new Error('Codex app-server timeout must be a positive integer');
    }
    const deadline = Date.now() + requestOptions.timeoutMs;
    if (requestOptions.signal?.aborted) throw abortedError(requestOptions.signal);
    clearIdleTimer();
    await awaitInitialization(ensureServer(requestOptions.timeoutMs), requestOptions.signal);
    clearIdleTimer();
    const server = child;
    if (server === null) throw safeError('Codex app-server is unavailable');
    if (requestOptions.signal?.aborted) throw abortedError(requestOptions.signal);
    const id = nextId;
    nextId += 1;

    return await new Promise<unknown>((resolve, reject) => {
      const onAbort = requestOptions.signal
        ? (): void => settlePending(id, abortedError(requestOptions.signal!))
        : undefined;
      const timer = setTimeout(() => {
        failServer(server, safeError('Codex app-server request timed out'));
      }, Math.max(1, deadline - Date.now()));
      pending.set(id, {
        resolve,
        reject,
        timer,
        signal: requestOptions.signal,
        onAbort,
      });
      if (requestOptions.signal && onAbort) {
        requestOptions.signal.addEventListener('abort', onAbort, { once: true });
      }
      server.stdin.write(`${JSON.stringify({ id, method, params })}\n`, (error) => {
        if (error) settlePending(id, safeError('Codex app-server input failed'));
      });
    });
  };
}
