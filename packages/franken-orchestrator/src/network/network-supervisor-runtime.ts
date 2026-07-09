import { spawn } from 'node:child_process';
import { existsSync, realpathSync } from 'node:fs';
import { open } from 'node:fs/promises';
import { Socket } from 'node:net';
import { dirname, delimiter, join, sep } from 'node:path';
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

const ALLOWED_NETWORK_SERVICE_ENV_KEYS: Partial<Record<ResolvedNetworkService['id'], readonly string[]>> = {
  'beasts-daemon': ['FRANKENBEAST_NETWORK_MANAGED', 'FRANKENBEAST_BEAST_DAEMON_URL'],
  'chat-server': ['FRANKENBEAST_NETWORK_MANAGED', 'FRANKENBEAST_BEAST_DAEMON_URL'],
  'dashboard-web': [
    'FRANKENBEAST_CONFIG_FILE',
    'FRANKENBEAST_DASHBOARD_API_URL',
    'FRANKENBEAST_DASHBOARD_HOST',
    'FRANKENBEAST_DASHBOARD_PORT',
    'FRANKENBEAST_TRUST_PROVIDER_COMMAND_OVERRIDES',
  ],
};

interface ValidatedProcessSpec {
  command: string;
  args: string[];
  cwd: string;
  env: NodeJS.ProcessEnv;
}

function assertSafeProcessValue(serviceId: string, field: string, value: string): void {
  if (!SAFE_PROCESS_VALUE_RE.test(value)) {
    throw new Error(`Unsafe network service ${field} for ${serviceId}`);
  }
}

function assertExpectedArg(condition: boolean, serviceId: string): void {
  if (!condition) {
    throw new Error(`Unsafe network service arguments for ${serviceId}`);
  }
}

function assertPortArg(serviceId: string, value: string): void {
  assertExpectedArg(/^\d+$/.test(value), serviceId);
}

function validateNpmServiceArgs(serviceId: 'beasts-daemon' | 'chat-server', args: string[]): void {
  assertExpectedArg(args.length >= 10, serviceId);
  assertExpectedArg(args[0] === '--silent', serviceId);
  assertExpectedArg(args[1] === '--workspace', serviceId);
  assertExpectedArg(args[2] === '@franken/orchestrator', serviceId);
  assertExpectedArg(args[3] === 'run', serviceId);
  assertExpectedArg(args[4] === serviceId, serviceId);
  assertExpectedArg(args[5] === '--', serviceId);
  assertExpectedArg(args[6] === '--host', serviceId);
  assertExpectedArg(args[8] === '--port', serviceId);
  assertPortArg(serviceId, args[9] ?? '');

  if (serviceId === 'beasts-daemon') {
    assertExpectedArg(args.length === 10, serviceId);
    return;
  }

  let trustedOverrideFlagSeen = false;
  for (let index = 10; index < args.length;) {
    const flag = args[index];
    if (flag === '--trust-provider-command-overrides') {
      assertExpectedArg(!trustedOverrideFlagSeen, serviceId);
      trustedOverrideFlagSeen = true;
      index += 1;
      continue;
    }

    const value = args[index + 1];
    assertExpectedArg(value !== undefined, serviceId);
    assertExpectedArg(flag === '--config' || flag === '--set', serviceId);
    index += 2;
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

function validateDashboardArgs(args: string[]): void {
  const serviceId = 'dashboard-web';
  assertExpectedArg(args.length === 16, serviceId);
  assertExpectedArg(args[0] === 'packages/franken-orchestrator/dist/http/dashboard-static-server.js', serviceId);
  assertExpectedArg(args[1] === '--host', serviceId);
  assertExpectedArg(args[3] === '--port', serviceId);
  assertPortArg(serviceId, args[4] ?? '');
  assertExpectedArg(args[5] === '--static-dir', serviceId);
  assertExpectedArg(args[6] === 'packages/franken-web/dist', serviceId);
  assertExpectedArg(args[7] === '--api-target', serviceId);
  assertExpectedArg(args[9] === '--build-command', serviceId);
  assertExpectedArg(args[11] === '--build-args', serviceId);
  assertExpectedArg(args[12] === '--workspace', serviceId);
  assertExpectedArg(args[13] === '@franken/web', serviceId);
  assertExpectedArg(args[14] === 'run', serviceId);
  assertExpectedArg(args[15] === 'build', serviceId);
}

function validateNetworkServiceArgs(service: ResolvedNetworkService): void {
  const processSpec = service.runtimeConfig.process;
  if (!processSpec) {
    return;
  }
  if (service.id === 'beasts-daemon' || service.id === 'chat-server') {
    validateNpmServiceArgs(service.id, processSpec.args);
    return;
  }
  if (service.id === 'dashboard-web') {
    validateDashboardArgs(processSpec.args);
  }
}

function validateNetworkServiceEnv(service: ResolvedNetworkService): void {
  const processSpec = service.runtimeConfig.process;
  if (!processSpec) {
    return;
  }
  const allowedKeys = ALLOWED_NETWORK_SERVICE_ENV_KEYS[service.id] ?? [];
  for (const [key, value] of Object.entries(processSpec.env ?? {})) {
    if (key.includes('=') || !allowedKeys.includes(key)) {
      throw new Error(`Unsafe network service environment key ${key} for ${service.id}`);
    }
    assertSafeProcessValue(service.id, `environment key ${key}`, key);
    assertSafeProcessValue(service.id, `environment value ${key}`, value);
  }
}

// Resolve the `npm` binary on PATH to its real target. Distro packages that
// ship npm separately from node (e.g. Debian's /usr/bin/npm) symlink the
// launcher to the real `npm-cli.js`, so following the link yields a trusted
// CLI script we can run directly with node — without spawning a shell or an
// npm shim. Returns null if npm is absent or does not resolve to an npm-cli.js.
function resolveNpmCliFromPath(): string | null {
  const pathDirs = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  for (const dir of pathDirs) {
    const candidate = join(dir, 'npm');
    if (!existsSync(candidate)) continue;
    try {
      const real = realpathSync(candidate);
      if (real.endsWith(`${sep}npm-cli.js`) && existsSync(real)) {
        return real;
      }
    } catch {
      // ignore unreadable/broken symlinks and keep searching
    }
  }
  return null;
}

function resolveNpmCliPath(): string {
  const execDir = dirname(process.execPath);
  // Also consider the realpath of node itself (nvm/distro symlink node into a
  // versioned dir); npm is colocated relative to the real binary, not the link.
  let realExecDir = execDir;
  try {
    realExecDir = dirname(realpathSync(process.execPath));
  } catch {
    // fall back to the symlinked location
  }
  const npmCliPathCandidates = [
    // Bundled node+npm (nvm, official installers, most images).
    join(execDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(execDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(realExecDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(realExecDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    // Common distro layouts where npm is packaged separately from node.
    join('/usr', 'share', 'nodejs', 'npm', 'bin', 'npm-cli.js'),
    join('/usr', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  const npmCliPath = npmCliPathCandidates.find((candidate) => existsSync(candidate)) ?? resolveNpmCliFromPath();
  if (!npmCliPath) {
    throw new Error(
      `Unable to locate a trusted npm CLI (checked locations relative to ${process.execPath}, common distro paths, and the npm launcher on PATH)`,
    );
  }
  return npmCliPath;
}

function deleteUnsafeInheritedProcessEnv(env: NodeJS.ProcessEnv): void {
  const deniedKeys = new Set([
    'node_options',
    'npm_config_node_options',
    'npm_config_script_shell',
    'npm_config_userconfig',
  ]);
  for (const key of Object.keys(env)) {
    if (deniedKeys.has(key.toLowerCase())) {
      delete env[key];
    }
  }
}

function buildNetworkProcessPath(): string {
  const pathEntries = process.platform === 'win32'
    ? [dirname(process.execPath)]
    : [dirname(process.execPath), '/usr/bin', '/bin'];
  return pathEntries.join(delimiter);
}

function buildNetworkProcessEnv(processSpecEnv: Record<string, string> | undefined): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  deleteUnsafeInheritedProcessEnv(env);
  return {
    ...env,
    ...processSpecEnv,
    PATH: buildNetworkProcessPath(),
  };
}

function buildValidatedProcessSpec(service: ResolvedNetworkService): ValidatedProcessSpec {
  validateNetworkProcessSpec(service);
  const processSpec = service.runtimeConfig.process;
  if (!processSpec) {
    throw new Error(`Service ${service.id} does not have a runnable entrypoint yet`);
  }
  const env = buildNetworkProcessEnv(processSpec.env);
  if (processSpec.command === 'npm' || processSpec.command === 'npm.cmd') {
    return {
      command: process.execPath,
      args: [resolveNpmCliPath(), ...processSpec.args],
      cwd: processSpec.cwd,
      env,
    };
  }
  if (processSpec.command === 'node' || processSpec.command === 'node.exe') {
    return {
      command: process.execPath,
      args: processSpec.args,
      cwd: processSpec.cwd,
      env,
    };
  }
  throw new Error(`Unsafe network service command for ${service.id}: ${processSpec.command}`);
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
  validateNetworkServiceArgs(service);
  validateNetworkServiceEnv(service);
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
  const validatedProcessSpec = buildValidatedProcessSpec(service);

  if (options.detached) {
    const handle = await open(options.logFile ?? '/dev/null', 'a');
    const child = spawn(validatedProcessSpec.command, validatedProcessSpec.args, {
      cwd: validatedProcessSpec.cwd,
      env: validatedProcessSpec.env,
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

  const child = spawn(validatedProcessSpec.command, validatedProcessSpec.args, {
    cwd: validatedProcessSpec.cwd,
    env: validatedProcessSpec.env,
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
    const headerIdentity = response.headers.get('x-frankenbeast-service');
    if (response.ok && headerIdentity) {
      return headerIdentity;
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.includes('application/json')) {
      return undefined;
    }

    const body = await response.json() as { service?: string; reason?: string };
    if (!response.ok) {
      return body.reason === 'dashboard-build-building' ? (headerIdentity ?? body.service) : undefined;
    }
    return body.service;
  } catch {
    return undefined;
  }
}
