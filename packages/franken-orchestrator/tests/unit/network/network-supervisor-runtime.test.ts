import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { startNetworkService, stopNetworkService } from '../../../src/network/network-supervisor-runtime.js';
import type { ResolvedNetworkService } from '../../../src/network/network-registry.js';

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
        args: [],
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
  });

  it('rejects service commands outside the registry allowlist before spawning', async () => {
    await expect(startNetworkService(makeService('sh'), {
      detached: false,
    })).rejects.toThrow('Unsafe network service command for chat-server: sh');

    expect(errorSpy).not.toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
  });

  it('rejects control characters in configured service arguments before spawning', async () => {
    await expect(startNetworkService(makeService('npm', {
      args: ['run', 'chat-server', 'bad\n--extra-flag'],
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

  it('rejects dashboard build commands outside the nested build allowlist', async () => {
    await expect(startNetworkService(makeService('node', {
      args: [
        'packages/franken-orchestrator/dist/http/dashboard-static-server.js',
        '--build-command',
        'sh',
        '--build-args',
        '-c',
        'touch /tmp/pwned',
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
