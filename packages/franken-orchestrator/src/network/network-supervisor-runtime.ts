import { spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { Socket } from 'node:net';
import type { ManagedNetworkServiceState } from './network-state-store.js';
import type { ResolvedNetworkService } from './network-registry.js';
import type { PreflightServiceResult, StartServiceOptions } from './network-supervisor.js';

const PORT_CHECK_TIMEOUT_MS = 300;
const HTTP_CHECK_TIMEOUT_MS = 1_000;
const SAFE_PROCESS_VALUE_RE = /^[^\x00-\x1f\x7f]*$/;

const ALLOWED_NETWORK_SERVICE_COMMANDS: Partial<Record<ResolvedNetworkService['id'], readonly string[]>> = {
  'beasts-daemon': ['npm', 'npm.cmd'],
  'chat-server': ['npm', 'npm.cmd'],
  'dashboard-web': ['node', 'node.exe'],
};

function assertSafeProcessValue(serviceId: string, field: string, value: string): void {
  if (!SAFE_PROCESS_VALUE_RE.test(value)) {
    throw new Error(`Unsafe network service ${field} for ${serviceId}`);
  }
}

function validateDashboardBuildCommand(service: ResolvedNetworkService): void {
  if (service.id !== 'dashboard-web') {
    return;
  }

  const processSpec = service.runtimeConfig.process;
  const buildCommandIndex = processSpec?.args.indexOf('--build-command') ?? -1;
  const buildCommand = buildCommandIndex >= 0 ? processSpec?.args[buildCommandIndex + 1] : undefined;
  if (!buildCommand || !['npm', 'npm.cmd'].includes(buildCommand)) {
    throw new Error(`Unsafe dashboard build command for ${service.id}: ${buildCommand ?? '<missing>'}`);
  }
}

function validateNetworkProcessSpec(service: ResolvedNetworkService): void {
  const processSpec = service.runtimeConfig.process;
  if (!processSpec) {
    return;
  }

  const allowedCommands = ALLOWED_NETWORK_SERVICE_COMMANDS[service.id] ?? [];
  if (!allowedCommands.includes(processSpec.command)) {
    throw new Error(`Unsafe network service command for ${service.id}: ${processSpec.command}`);
  }

  for (const arg of processSpec.args) {
    assertSafeProcessValue(service.id, 'argument', arg);
  }
  assertSafeProcessValue(service.id, 'working directory', processSpec.cwd);
  for (const [key, value] of Object.entries(processSpec.env ?? {})) {
    if (key.includes('=')) {
      throw new Error(`Unsafe network service environment key ${key} for ${service.id}`);
    }
    assertSafeProcessValue(service.id, `environment key ${key}`, key);
    assertSafeProcessValue(service.id, `environment value ${key}`, value);
  }
  validateDashboardBuildCommand(service);
}

export async function startNetworkService(
  service: ResolvedNetworkService,
  options: StartServiceOptions,
): Promise<{ pid: number }> {
  const processSpec = service.runtimeConfig.process;
  if (!processSpec) {
    throw new Error(`Service ${service.id} does not have a runnable entrypoint yet`);
  }
  validateNetworkProcessSpec(service);

  if (options.detached) {
    const handle = await open(options.logFile ?? '/dev/null', 'a');
    const child = spawn(processSpec.command, processSpec.args, {
      cwd: processSpec.cwd,
      env: {
        ...process.env,
        ...processSpec.env,
      },
      detached: true,
      stdio: ['ignore', handle.fd, handle.fd],
    });
    child.once('error', (error) => {
      console.error(`[${service.id}] Process spawn failed for ${processSpec.command}: ${error.message}`);
    });
    child.unref();
    await handle.close();
    if (!child.pid) {
      throw new Error(`Failed to start detached service ${service.id}`);
    }
    return { pid: child.pid };
  }

  const child = spawn(processSpec.command, processSpec.args, {
    cwd: processSpec.cwd,
    env: {
      ...process.env,
      ...processSpec.env,
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  child.once('error', (error) => {
    console.error(`[${service.id}] Process spawn failed for ${processSpec.command}: ${error.message}`);
  });

  child.stdout?.on('data', (chunk) => process.stdout.write(`[${service.id}] ${chunk}`));
  child.stderr?.on('data', (chunk) => process.stderr.write(`[${service.id}] ${chunk}`));

  if (!child.pid) {
    throw new Error(`Failed to start service ${service.id}`);
  }

  return { pid: child.pid };
}

export async function stopNetworkService(service: { pid: number; detached?: boolean | undefined }): Promise<void> {
  if (service.pid <= 0) {
    return;
  }

  try {
    if ('detached' in service && service.detached === true) {
      process.kill(-service.pid, 'SIGTERM');
      return;
    }

    process.kill(service.pid, 'SIGTERM');
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code;
    if (code !== 'ESRCH') {
      throw error;
    }
  }
}

export async function healthcheckNetworkService(service: ManagedNetworkServiceState): Promise<boolean> {
  const probeUrl = service.healthUrl ?? service.url;
  if (probeUrl) {
    try {
      const response = await fetch(probeUrl, {
        signal: AbortSignal.timeout(HTTP_CHECK_TIMEOUT_MS),
      });
      return response.ok;
    } catch {
      // Fall back to PID checks for services that have not opened HTTP yet.
    }
  }

  if (service.pid <= 0) {
    return false;
  }

  try {
    process.kill(service.pid, 0);
    return true;
  } catch {
    return false;
  }
}

export async function preflightNetworkService(service: ResolvedNetworkService): Promise<PreflightServiceResult> {
  const { host, port, healthUrl, serviceIdentity } = service.runtimeConfig;

  if (!host || port === undefined) {
    return { action: 'start' };
  }

  const occupied = await isPortOccupied(host, port);
  if (!occupied) {
    return { action: 'start' };
  }

  if (healthUrl && serviceIdentity) {
    const identity = await fetchServiceIdentity(healthUrl);
    if (identity === serviceIdentity) {
      return { action: 'reuse' };
    }
  }

  return {
    action: 'conflict',
    reason: `Port conflict for ${service.id} on ${host}:${port}; another process is already listening`,
  };
}

async function isPortOccupied(host: string, port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new Socket();
    let settled = false;

    const finish = (result: boolean): void => {
      if (settled) {
        return;
      }
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(PORT_CHECK_TIMEOUT_MS);
    socket.once('connect', () => finish(true));
    socket.once('timeout', () => finish(false));
    socket.once('error', (error) => {
      const code = (error as NodeJS.ErrnoException).code;
      finish(code !== 'ECONNREFUSED' && code !== 'EHOSTUNREACH');
    });
    socket.connect(port, host);
  });
}

async function fetchServiceIdentity(url: string): Promise<string | undefined> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(HTTP_CHECK_TIMEOUT_MS),
    });
    if (!response.ok) {
      return undefined;
    }

    const headerIdentity = response.headers.get('x-frankenbeast-service');
    if (headerIdentity) {
      return headerIdentity;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return undefined;
    }

    const body = await response.json() as { service?: string };
    return body.service;
  } catch {
    return undefined;
  }
}
