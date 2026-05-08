import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;

describe('fbeast main CLI', () => {
  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('./uninstall.js');
  });

  it('passes explicit uninstall client into uninstall execution', async () => {
    const runUninstall = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./uninstall.js', () => ({ runUninstall }));

    process.argv = ['node', 'fbeast', 'mcp', 'uninstall', '--client=codex'];

    await import('./main.js');

    expect(runUninstall).toHaveBeenCalledWith(expect.objectContaining({ client: 'codex' }));
  });

  it('passes through non-mcp commands to frankenbeast', async () => {
    const mockSpawnSync = vi.fn().mockReturnValue({ status: 0, signal: null, error: undefined });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'network', 'up'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    expect(mockSpawnSync).toHaveBeenCalledWith('frankenbeast', ['network', 'up'], { stdio: 'inherit' });
    mockExit.mockRestore();
  });

  it('propagates signal termination from passthrough commands', async () => {
    const mockSpawnSync = vi.fn().mockReturnValue({ status: null, signal: 'SIGTERM', error: undefined });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'network', 'up'];

    const mockKill = vi.spyOn(process, 'kill').mockImplementation(() => true);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    expect(mockKill).toHaveBeenCalledWith(process.pid, 'SIGTERM');
    expect(mockExit).toHaveBeenCalledWith(143);
  });
});
