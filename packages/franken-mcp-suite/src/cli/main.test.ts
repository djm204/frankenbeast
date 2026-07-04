import { afterEach, describe, expect, it, vi } from 'vitest';

const originalArgv = process.argv;

describe('fbeast main CLI', () => {
  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    vi.resetModules();
    vi.doUnmock('./init.js');
    vi.doUnmock('./uninstall.js');
  });

  it('passes explicit uninstall client into uninstall execution', async () => {
    const runUninstall = vi.fn().mockResolvedValue(undefined);
    vi.doMock('./uninstall.js', () => ({ runUninstall }));

    process.argv = ['node', 'fbeast', 'mcp', 'uninstall', '--client=codex'];

    await import('./main.js');

    expect(runUninstall).toHaveBeenCalledWith(expect.objectContaining({ client: 'codex' }));
  });

  it('reports invalid init mode as a clean CLI error without a stack trace', async () => {
    const runInit = vi.fn();
    vi.doMock('./init.js', () => ({ runInit }));

    process.argv = ['node', 'fbeast', 'mcp', 'init', '--mode=bad', '--client=claude'];

    const mockError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    const message = mockError.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('fbeast mcp init: Unknown --mode value: bad');
    expect(message).toContain('standard, proxy');
    expect(message).toContain('--client=claude|gemini|codex');
    expect(message).not.toContain(' at ');
    expect(runInit).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('reports invalid init client as a clean CLI error without a stack trace', async () => {
    const runInit = vi.fn();
    vi.doMock('./init.js', () => ({ runInit }));

    process.argv = ['node', 'fbeast', 'mcp', 'init', '--client=bad'];

    const mockError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    const message = mockError.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('fbeast mcp init: Invalid --client value "bad"');
    expect(message).toContain('claude, gemini, or codex');
    expect(message).not.toContain(' at ');
    expect(runInit).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
  });

  it('reports invalid init pick values as a clean CLI error without a stack trace', async () => {
    const runInit = vi.fn();
    vi.doMock('./init.js', () => ({ runInit }));

    process.argv = ['node', 'fbeast', 'mcp', 'init', '--client=claude', '--pick=memory,bad'];

    const mockError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    const message = mockError.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('fbeast mcp init: Unknown --pick value(s): bad');
    expect(message).toContain('memory');
    expect(message).not.toContain(' at ');
    expect(runInit).not.toHaveBeenCalled();
    expect(mockExit).toHaveBeenCalledWith(1);
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

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'frankenbeast',
      ['network', 'up'],
      expect.objectContaining({ stdio: 'inherit', shell: process.platform === 'win32' }),
    );
    mockExit.mockRestore();
  });

  it('uses shell on Windows so npm .cmd shims are resolved', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const mockSpawnSync = vi.fn().mockReturnValue({ status: 0, signal: null, error: undefined });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'network', 'up'];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    expect(mockSpawnSync).toHaveBeenCalledWith(
      'frankenbeast',
      ['network', 'up'],
      expect.objectContaining({ shell: true }),
    );
    mockExit.mockRestore();
    platformSpy.mockRestore();
  });

  it('reports correct package name when frankenbeast binary is missing', async () => {
    const enoent: NodeJS.ErrnoException = Object.assign(new Error('spawn frankenbeast ENOENT'), { code: 'ENOENT' });
    const mockSpawnSync = vi.fn().mockReturnValue({ status: null, signal: null, error: enoent });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'network', 'up'];

    const mockError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    const message = mockError.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('franken-orchestrator');
    expect(message).not.toContain('@fbeast/orchestrator');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockError.mockRestore();
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
