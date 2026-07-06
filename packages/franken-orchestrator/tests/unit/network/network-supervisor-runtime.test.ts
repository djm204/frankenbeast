import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { startNetworkService, stopNetworkService } from '../../../src/network/network-supervisor-runtime.js';
import type { ResolvedNetworkService } from '../../../src/network/network-registry.js';

function makeService(command: string): ResolvedNetworkService {
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
    runtimeConfig: {
      process: {
        command,
        args: [],
        cwd: process.cwd(),
      },
    },
  };
}

describe('startNetworkService', () => {
  const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  afterEach(() => {
    errorSpy.mockClear();
  });

  afterAll(() => {
    errorSpy.mockRestore();
  });

  it('handles child process error events for missing foreground services without crashing', async () => {
    await expect(startNetworkService(makeService('/definitely/not-a-real-command-franken-698'), {
      detached: false,
    })).rejects.toThrow(/Failed to start service chat-server/);

    await vi.waitFor(() => {
      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Process spawn failed'));
    }, { timeout: 5000 });
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
