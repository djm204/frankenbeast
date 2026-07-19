import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import {
  healthcheckNetworkService,
  preflightNetworkService,
  startNetworkService,
  stopNetworkService,
} from '../../../src/network/network-supervisor-runtime.js';
import type { ResolvedNetworkService } from '../../../src/network/network-registry.js';

const spawnMock = vi.hoisted(() => vi.fn(() => ({
  pid: 4242,
  stdout: { on: vi.fn() },
  stderr: { on: vi.fn() },
  once: vi.fn(),
  unref: vi.fn(),
})));

vi.mock('node:child_process', () => ({
  spawn: spawnMock,
}));

const CHAT_SERVER_ARGS = [
  '--silent',
  '--workspace',
  '@franken/orchestrator',
  'run',
  'chat-server',
  '--',
  '--host',
  '127.0.0.1',
  '--port',
  '4567',
];

const BEASTS_DAEMON_ARGS = [
  '--silent',
  '--workspace',
  '@franken/orchestrator',
  'run',
  'beasts-daemon',
  '--',
  '--host',
  '127.0.0.1',
  '--port',
  '4050',
];

const DASHBOARD_ARGS = [
  'packages/franken-orchestrator/dist/http/dashboard-static-server.js',
  '--host',
  '127.0.0.1',
  '--port',
  '5173',
  '--static-dir',
  'packages/franken-web/dist',
  '--api-target',
  'http://127.0.0.1:4567',
  '--build-command',
  'npm',
  '--build-args',
  '--workspace',
  '@franken/web',
  'run',
  'build',
];

function makeService(
  command: string,
  overrides: Partial<ResolvedNetworkService['runtimeConfig']['process']> = {},
  serviceOverrides: Partial<ResolvedNetworkService> = {},
): ResolvedNetworkService {
  return {
    id: 'chat-server',
    displayName: 'Chat Server',
    kind: 'app',
    dependsOn: [],
    configPaths: [],
    enabled: () => true,
    describe: () => 'test service',
    buildRuntimeConfig: () => ({}),
    explanation: 'test service',
    ...serviceOverrides,
    runtimeConfig: {
      process: {
        command,
        args: CHAT_SERVER_ARGS,
        cwd: process.cwd(),
        ...overrides,
      },
    },
  };
}

describe('startNetworkService', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    errorSpy.mockClear();
    spawnMock.mockClear();
    vi.unstubAllEnvs();
  });

  it('rejects service commands outside the registry allowlist before spawning', async () => {
    await expect(startNetworkService(makeService('sh'), {
      detached: false,
    })).rejects.toThrow('Unsafe network service command for chat-server: sh');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('rejects control characters in configured service arguments before spawning', async () => {
    await expect(startNetworkService(makeService('npm', {
      args: [...CHAT_SERVER_ARGS, '--set', 'bad\n--extra-flag'],
    }), {
      detached: false,
    })).rejects.toThrow('Unsafe network service argument for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it('rejects absolute service commands not owned by the network registry before spawning', async () => {
    await expect(startNetworkService(makeService('/definitely/not-a-real-command-franken-698'), {
      detached: false,
    })).rejects.toThrow('Unsafe network service command for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('rejects absolute paths that end in an allowed command basename', async () => {
    await expect(startNetworkService(makeService('/tmp/npm'), {
      detached: false,
    })).rejects.toThrow('Unsafe network service command for chat-server: /tmp/npm');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('rejects environment keys that can be serialized as another variable name', async () => {
    await expect(startNetworkService(makeService('npm', {
      env: { 'NODE_OPTIONS=--require /tmp/hook': 'x' },
    }), {
      detached: false,
    })).rejects.toThrow('Unsafe network service environment key NODE_OPTIONS=--require /tmp/hook for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('does not inherit unrelated orchestrator secrets when starting a managed service', async () => {
    vi.stubEnv('FRANKENBEAST_NETWORK_TEST_SECRET', 'must-not-reach-child');
    vi.stubEnv('HOME', '/safe-network-home');
    vi.stubEnv('HERMES_HOME', '/safe-hermes-home');
    vi.stubEnv('HERMES_PROFILE', 'network-test');

    await expect(startNetworkService(makeService('npm', {
      env: {
        FRANKENBEAST_NETWORK_MANAGED: '1',
        FRANKENBEAST_BEAST_DAEMON_URL: 'http://127.0.0.1:4050',
      },
    }), {
      detached: false,
    })).resolves.toEqual({ pid: 4242 });

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv } | undefined;
    const spawnedEnv = spawnOptions?.env ?? {};
    expect(spawnedEnv).toEqual(expect.objectContaining({
      HOME: '/safe-network-home',
      HERMES_HOME: '/safe-hermes-home',
      HERMES_PROFILE: 'network-test',
      PATH: expect.any(String),
      FRANKENBEAST_NETWORK_MANAGED: '1',
      FRANKENBEAST_BEAST_DAEMON_URL: 'http://127.0.0.1:4050',
    }));
    expect(spawnedEnv).not.toHaveProperty('FRANKENBEAST_NETWORK_TEST_SECRET');
    const permittedKeys = new Set([
      'HOME',
      'HERMES_HOME',
      'HERMES_PROFILE',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'TMP',
      'TEMP',
      'USERPROFILE',
      'SystemRoot',
      'COMSPEC',
      'PATHEXT',
      'PATH',
      'FRANKENBEAST_NETWORK_MANAGED',
      'FRANKENBEAST_BEAST_DAEMON_URL',
    ]);
    expect(Object.keys(spawnedEnv).every((key) => permittedKeys.has(key))).toBe(true);
  });

  it('inherits only credentials required by the managed service', async () => {
    vi.stubEnv('FRANKENBEAST_BEAST_OPERATOR_TOKEN', 'operator-token-for-test');
    vi.stubEnv('FRANKENBEAST_PASSPHRASE', 'vault-passphrase-for-test');
    vi.stubEnv('OPENAI_API_KEY', 'provider-key-for-test');
    vi.stubEnv('FRANKENBEAST_NETWORK_TEST_SECRET', 'unrelated-secret-for-test');

    await expect(startNetworkService(makeService('npm', {
      args: BEASTS_DAEMON_ARGS,
      env: {
        FRANKENBEAST_NETWORK_MANAGED: '1',
        FRANKENBEAST_BEAST_DAEMON_URL: 'http://127.0.0.1:4050',
      },
    }, {
      id: 'beasts-daemon',
    }), {
      detached: false,
    })).resolves.toEqual({ pid: 4242 });

    const spawnOptions = spawnMock.mock.calls[0]?.[2] as { env?: NodeJS.ProcessEnv } | undefined;
    expect(spawnOptions?.env).toEqual(expect.objectContaining({
      FRANKENBEAST_BEAST_OPERATOR_TOKEN: 'operator-token-for-test',
      FRANKENBEAST_PASSPHRASE: 'vault-passphrase-for-test',
      OPENAI_API_KEY: 'provider-key-for-test',
    }));
    expect(spawnOptions?.env).not.toHaveProperty('FRANKENBEAST_NETWORK_TEST_SECRET');
  });

  it('rejects process environment overrides that can redirect launcher resolution', async () => {
    await expect(startNetworkService(makeService('npm', {
      env: { PATH: '/tmp/malicious-bin' },
    }), {
      detached: false,
    })).rejects.toThrow('Unsafe network service environment key PATH for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('rejects Node option environment overrides before launching npm services', async () => {
    await expect(startNetworkService(makeService('npm', {
      env: { NODE_OPTIONS: '--require /tmp/hook' },
    }), {
      detached: false,
    })).rejects.toThrow('Unsafe network service environment key NODE_OPTIONS for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('rejects unexpected npm launcher subcommands for managed services', async () => {
    await expect(startNetworkService(makeService('npm', {
      args: ['exec', 'sh', '-c', 'touch /tmp/pwned'],
    }), {
      detached: false,
    })).rejects.toThrow('Unsafe network service arguments for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('allows approved trust-override flags for managed chat services', async () => {
    await expect(startNetworkService(makeService('npm', {
      args: [
        ...CHAT_SERVER_ARGS,
        '--config',
        '/repo/frankenbeast/.fbeast/config.json',
        '--trust-provider-command-overrides',
        '--set',
        'providers.openai.enabled=true',
      ],
    }), {
      detached: false,
    })).resolves.toEqual({ pid: 4242 });

    expect(spawn).toHaveBeenCalledOnce();
  });

  it('rejects duplicate trust-override flags for managed chat services', async () => {
    await expect(startNetworkService(makeService('npm', {
      args: [
        ...CHAT_SERVER_ARGS,
        '--trust-provider-command-overrides',
        '--trust-provider-command-overrides',
      ],
    }), {
      detached: false,
    })).rejects.toThrow('Unsafe network service arguments for chat-server');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('allows the approved trust-override environment for managed dashboard services', async () => {
    await expect(startNetworkService(makeService('node', {
      args: DASHBOARD_ARGS,
      env: {
        FRANKENBEAST_CONFIG_FILE: '/repo/frankenbeast/.fbeast/config.json',
        FRANKENBEAST_DASHBOARD_API_URL: 'http://127.0.0.1:3737',
        FRANKENBEAST_DASHBOARD_HOST: '127.0.0.1',
        FRANKENBEAST_DASHBOARD_PORT: '5173',
        VITE_API_PROXY_TARGET: 'http://127.0.0.1:3737',
        FRANKENBEAST_TRUST_PROVIDER_COMMAND_OVERRIDES: '1',
      },
    }, { id: 'dashboard-web' }), {
      detached: false,
    })).resolves.toEqual({ pid: 4242 });

    expect(spawn).toHaveBeenCalledOnce();
  });

  it('rejects dashboard build commands outside the nested build allowlist', async () => {
    await expect(startNetworkService(makeService('node', {
      args: [
        ...DASHBOARD_ARGS.slice(0, 10),
        'sh',
        ...DASHBOARD_ARGS.slice(11),
      ],
    }, { id: 'dashboard-web' }), {
      detached: false,
    })).rejects.toThrow('Unsafe dashboard build command for dashboard-web: sh');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });
});

describe('stopNetworkService', () => {
  const killSpy = vi.spyOn(process, 'kill');

  afterEach(() => {
    killSpy.mockReset();
  });

  it('signals the detached process group for detached services', async () => {
    killSpy.mockReturnValue(true);

    await stopNetworkService({ pid: 4242, detached: true });

    expect(killSpy).toHaveBeenCalledWith(-4242, 'SIGTERM');
  });

  it('signals the direct pid for non-detached services', async () => {
    killSpy.mockReturnValue(true);

    await stopNetworkService({ pid: 3131 });

    expect(killSpy).toHaveBeenCalledWith(3131, 'SIGTERM');
  });

  it('does nothing for placeholder reuse entries without a pid', async () => {
    await stopNetworkService({ pid: 0, detached: true });

    expect(killSpy).not.toHaveBeenCalled();
  });
});

describe('network degraded health handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('preserves read-only degraded health for stored-service healthchecks', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: false,
      status: 'degraded',
      service: 'beasts-daemon',
      availability: { mode: 'read-only-degraded', readOnly: true },
    }, { status: 503 })));

    await expect(healthcheckNetworkService({
      id: 'beasts-daemon',
      displayName: 'Beast Daemon',
      pid: 4242,
      healthUrl: 'http://127.0.0.1:4050/health',
      startedAt: '2026-07-16T00:00:00.000Z',
    })).resolves.toBe('degraded');
  });

  it('rejects healthy config-only probes with the wrong service identity', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      ok: true,
      status: 'healthy',
      service: 'unrelated-service',
    })));

    await expect(healthcheckNetworkService({
      id: 'chat-server',
      displayName: 'Chat Server',
      pid: 0,
      healthUrl: 'http://127.0.0.1:3737/health',
      serviceIdentity: 'chat-server',
      startedAt: '2026-07-17T00:00:00.000Z',
    })).resolves.toBe(false);
  });

  it('reuses a port whose health identity is read-only degraded', async () => {
    const server = createServer((_req, res) => {
      res.statusCode = 503;
      res.setHeader('content-type', 'application/json');
      res.setHeader('x-frankenbeast-service', 'beasts-daemon');
      res.end(JSON.stringify({
        ok: false,
        status: 'degraded',
        service: 'beasts-daemon',
        availability: { mode: 'read-only-degraded', readOnly: true },
      }));
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const address = server.address();
      if (!address || typeof address === 'string') {
        throw new Error('test server did not bind to a TCP port');
      }
      const service: ResolvedNetworkService = {
        id: 'beasts-daemon',
        displayName: 'Beast Daemon',
        kind: 'app',
        dependsOn: [],
        configPaths: [],
        enabled: () => true,
        describe: () => 'test daemon',
        buildRuntimeConfig: () => ({}),
        explanation: 'test daemon',
        runtimeConfig: {
          process: { command: 'npm', args: CHAT_SERVER_ARGS, cwd: process.cwd() },
          host: '127.0.0.1',
          port: address.port,
          healthUrl: `http://127.0.0.1:${address.port}/health`,
          serviceIdentity: 'beasts-daemon',
        },
      };
      await expect(preflightNetworkService(service)).resolves.toEqual({ action: 'reuse' });
    } finally {
      await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    }
  });
});
