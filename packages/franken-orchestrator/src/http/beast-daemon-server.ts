import { createServer, type Server as HttpServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Hono } from 'hono';
import { createBeastServices, type BeastServiceBundle, type BeastServicePaths } from '../beasts/create-beast-services.js';
import { isLoopbackHost } from '../network/network-config.js';
import { localPlaintextOrSecureEndpoint } from '../network/network-url.js';
import { createBeastDaemonApp, type BeastDaemonDrainState } from './beast-daemon-app.js';
import { closeHttpServer, handleHonoHttpRequest } from './http-server-utils.js';

export interface StartBeastDaemonOptions extends BeastServicePaths {
  root: string;
  host?: string;
  port?: number;
  operatorToken: string;
  pidFile?: string;
  services?: BeastServiceBundle;
}

export interface BeastDaemonHandle {
  app: Hono;
  server: HttpServer;
  services: BeastServiceBundle;
  url: string;
  pidFile: string;
  close(): Promise<void>;
}

export interface BeastDaemonRunShutdownFailure {
  readonly runId: string;
  readonly stopError: unknown;
  readonly killError: unknown;
}

export class BeastDaemonShutdownError extends Error {
  constructor(readonly failures: readonly BeastDaemonRunShutdownFailure[]) {
    const details = failures
      .map((failure) => `${failure.runId} (stop: ${errorMessage(failure.stopError)}; kill: ${errorMessage(failure.killError)})`)
      .join(', ');
    super(`Beast daemon failed to stop or kill ${failures.length} child run(s): ${details}`);
    this.name = 'BeastDaemonShutdownError';
  }
}

export class BeastDaemonDrainTimeoutError extends Error {
  constructor(timeoutMs: number) {
    super(`Beast daemon timed out after ${timeoutMs}ms waiting for in-flight mutating requests to finish during shutdown`);
    this.name = 'BeastDaemonDrainTimeoutError';
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4050;
const MUTATION_DRAIN_WAIT_TIMEOUT_MS = 5000;
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'stopped']);
const PID_FILE_DECIMAL_PATTERN = /^\d+$/;

class MutableBeastDaemonDrainState implements BeastDaemonDrainState {
  enteredAt?: string | undefined;
  reason?: string | undefined;
  private activeMutations = 0;
  private mutationWaiters: Array<() => void> = [];

  isDraining(): boolean {
    return this.enteredAt !== undefined;
  }

  enter(reason: string): void {
    if (!this.enteredAt) {
      this.enteredAt = new Date().toISOString();
      this.reason = reason;
    }
  }

  beginMutation(): () => void {
    this.activeMutations += 1;
    let finished = false;
    return () => {
      if (finished) {
        return;
      }
      finished = true;
      this.activeMutations -= 1;
      if (this.activeMutations === 0) {
        for (const waiter of this.mutationWaiters.splice(0)) {
          waiter();
        }
      }
    };
  }

  async waitForMutations(timeoutMs = MUTATION_DRAIN_WAIT_TIMEOUT_MS): Promise<boolean> {
    if (this.activeMutations === 0) {
      return true;
    }
    return await new Promise<boolean>((resolve) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (!settled) {
          settled = true;
          resolve(false);
        }
      }, timeoutMs);
      this.mutationWaiters.push(() => {
        if (!settled) {
          settled = true;
          clearTimeout(timeout);
          resolve(true);
        }
      });
    });
  }
}

export function defaultBeastDaemonPidFile(root: string): string {
  return join(root, '.frankenbeast', 'beasts-daemon.pid');
}

export async function startBeastDaemon(options: StartBeastDaemonOptions): Promise<BeastDaemonHandle> {
  const host = options.host ?? DEFAULT_HOST;
  const port = options.port ?? DEFAULT_PORT;
  if (!isLoopbackHost(host)) {
    throw new Error(`Refusing to start beast daemon on non-loopback host ${host}; terminate TLS in a separate reverse proxy for non-local deployments.`);
  }
  const pidFile = options.pidFile ?? defaultBeastDaemonPidFile(options.root);
  await claimPidFile(pidFile);

  let services: BeastServiceBundle | undefined;
  let closed = false;
  let listening = false;
  const drainState = new MutableBeastDaemonDrainState();

  try {
    services = options.services ?? createBeastServices(options);
  } catch (error) {
    await releasePidFile(pidFile);
    throw error;
  }

  const app = createBeastDaemonApp({
    services,
    operatorToken: options.operatorToken,
    root: options.root,
    pid: process.pid,
    drainState,
  });
  const server = createServer((request, response) => {
    void handleHonoHttpRequest(app, request, response);
  });

  try {
    await new Promise<void>((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, host, () => {
        listening = true;
        server.off('error', reject);
        resolve();
      });
    });
  } catch (error) {
    services.dispose();
    await releasePidFile(pidFile);
    throw error;
  }

  const address = server.address();
  if (!address || typeof address === 'string') {
    services.dispose();
    await releasePidFile(pidFile);
    throw new Error('Beast daemon did not bind to a TCP address');
  }

  const url = localPlaintextOrSecureEndpoint(host, address.port);

  return {
    app,
    server,
    services,
    url,
    pidFile,
    close: async () => {
      if (closed) {
        return;
      }
      closed = true;
      drainState.enter('shutdown');
      const drainedMutations = await drainState.waitForMutations();
      let httpServerClosed = false;
      if (!drainedMutations && listening) {
        const closedServer = closeHttpServer(server);
        server.closeAllConnections();
        await closedServer;
        httpServerClosed = true;
      }
      const shutdownFailures = await stopLiveRuns(services);
      services.dispose();
      if (listening && !httpServerClosed) {
        const closedServer = closeHttpServer(server);
        server.closeAllConnections();
        await closedServer;
      }
      if (!drainedMutations) {
        throw new BeastDaemonDrainTimeoutError(MUTATION_DRAIN_WAIT_TIMEOUT_MS);
      }
      if (shutdownFailures.length > 0) {
        throw new BeastDaemonShutdownError(shutdownFailures);
      }
      await releasePidFile(pidFile);
    },
  };
}

async function claimPidFile(pidFile: string): Promise<void> {
  const existingPid = await readExistingPidFile(pidFile);
  if (existingPid !== undefined) {
    if (isProcessAlive(existingPid)) {
      throw new Error(`beasts-daemon is already running with PID ${existingPid} (${pidFile})`);
    }
    await rm(pidFile, { force: true });
  }
  await mkdir(dirname(pidFile), { recursive: true });
  await writeFile(pidFile, `${process.pid}\n`, { flag: 'wx' });
}

async function readExistingPidFile(pidFile: string): Promise<number | undefined> {
  try {
    const raw = await readFile(pidFile, 'utf8');
    const pid = parsePidFileContents(raw);
    if (pid !== undefined) {
      return pid;
    }
    await rm(pidFile, { force: true });
    return undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

async function readPidFile(pidFile: string): Promise<number | undefined> {
  try {
    const raw = await readFile(pidFile, 'utf8');
    return parsePidFileContents(raw);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
}

function parsePidFileContents(raw: string): number | undefined {
  const trimmed = raw.trim();
  if (!PID_FILE_DECIMAL_PATTERN.test(trimmed)) {
    return undefined;
  }
  const pid = Number(trimmed);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : undefined;
}

function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === 'EPERM';
  }
}

async function releasePidFile(pidFile: string): Promise<void> {
  const existingPid = await readPidFile(pidFile).catch(() => undefined);
  if (existingPid === process.pid || existingPid === undefined) {
    await rm(pidFile, { force: true });
  }
}

async function stopLiveRuns(services: BeastServiceBundle): Promise<BeastDaemonRunShutdownFailure[]> {
  const failures: BeastDaemonRunShutdownFailure[] = [];
  for (const run of services.runs.listRuns()) {
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      continue;
    }
    try {
      await services.runs.stop(run.id, 'beasts-daemon-shutdown');
    } catch (stopError) {
      try {
        await services.runs.kill(run.id, 'beasts-daemon-shutdown');
      } catch (killError) {
        failures.push({ runId: run.id, stopError, killError });
        // Continue best-effort shutdown for remaining children.
      }
    }
  }
  return failures;
}
