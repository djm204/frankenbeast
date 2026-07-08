import { spawn } from 'node:child_process';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { startNetworkService, stopNetworkService } from '../../../src/network/network-supervisor-runtime.js';
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
