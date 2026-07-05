import { createServer, type Server as HttpServer } from 'node:http';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Hono } from 'hono';
import { createBeastServices, type BeastServiceBundle, type BeastServicePaths } from '../beasts/create-beast-services.js';
import { isLoopbackHost } from '../network/network-config.js';
import { localPlaintextOrSecureEndpoint } from '../network/network-url.js';
import { createBeastDaemonApp } from './beast-daemon-app.js';
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

const DEFAULT_HOST = '127.0.0.1';
const DEFAULT_PORT = 4050;
const TERMINAL_RUN_STATUSES = new Set(['completed', 'failed', 'stopped']);

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

  try {
    services = options.services ?? createBeastServices(options);
  } catch (error) {
    await releasePidFile(pidFile);
    throw error;
  }

  const app = createBeastDaemonApp({ services, operatorToken: options.operatorToken });
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
      await stopLiveRuns(services);
      services.dispose();
      if (listening) {
        const closedServer = closeHttpServer(server);
        server.closeAllConnections();
        await closedServer;
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
    const pid = Number.parseInt(raw.trim(), 10);
    if (Number.isFinite(pid) && pid > 0) {
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
    const pid = Number.parseInt(raw.trim(), 10);
    return Number.isFinite(pid) && pid > 0 ? pid : undefined;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return undefined;
    }
    throw error;
  }
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

async function stopLiveRuns(services: BeastServiceBundle): Promise<void> {
  for (const run of services.runs.listRuns()) {
    if (TERMINAL_RUN_STATUSES.has(run.status)) {
      continue;
    }
    try {
      await services.runs.stop(run.id, 'beasts-daemon-shutdown');
    } catch {
      try {
        await services.runs.kill(run.id, 'beasts-daemon-shutdown');
      } catch {
        // Continue best-effort shutdown for remaining children.
      }
    }
  }
}
