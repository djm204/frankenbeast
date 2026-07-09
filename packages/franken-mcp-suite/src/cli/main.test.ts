import { afterEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

const originalArgv = process.argv;
const tmpDirs: string[] = [];

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-main-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  tmpDirs.push(dir);
  return dir;
}

describe('fbeast main CLI', () => {
  afterEach(() => {
    process.argv = originalArgv;
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.resetModules();
    vi.doUnmock('./init.js');
    vi.doUnmock('./uninstall.js');
    for (const dir of tmpDirs.splice(0)) {
      if (existsSync(dir)) rmSync(dir, { recursive: true, force: true });
    }
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

  it('exits 0 for fbeast --help', async () => {
    const mockSpawnSync = vi.fn();
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', '--help'];
    const mockInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    expect(mockSpawnSync).not.toHaveBeenCalled();
    const message = mockInfo.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('Usage: fbeast <command> [args...]');
    expect(message).toContain('mcp   MCP server management commands');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits 0 for fbeast help', async () => {
    const mockSpawnSync = vi.fn();
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'help'];
    const mockInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    expect(mockSpawnSync).not.toHaveBeenCalled();
    const message = mockInfo.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('Usage: fbeast <command> [args...]');
    expect(message).toContain('help  Display help (this message)');
    expect(mockExit).toHaveBeenCalledWith(0);
  });

  it('exits 0 for fbeast mcp --help', async () => {
    const mockSpawnSync = vi.fn();
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'mcp', '--help'];
    const mockInfo = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    expect(mockSpawnSync).not.toHaveBeenCalled();
    const message = mockInfo.mock.calls.map((c) => c.join(' ')).join('\n');
    expect(message).toContain('Usage: fbeast mcp <command>');
    expect(mockExit).toHaveBeenCalledWith(0);
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
    vi.stubEnv('PATH', '');
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
      expect.objectContaining({ stdio: 'inherit', shell: false }),
    );
    mockExit.mockRestore();
  });

  it('launches Windows .cmd shims through cmd.exe without enabling shell mode', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const binDir = tmpDir();
    const shimPath = join(binDir, 'frankenbeast.CMD');
    writeFileSync(shimPath, '@echo off\r\n');
    vi.stubEnv('PATH', binDir);
    vi.stubEnv('PATHEXT', '.COM;.EXE;.BAT;.CMD');
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe');
    const mockSpawnSync = vi.fn().mockReturnValue({ status: 0, signal: null, error: undefined });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = [
      'node',
      'fbeast',
      'network',
      'up',
      'name&whoami',
      '100%literal%',
      'C:\\tmp\\',
      'with space',
      '--set=a" b',
      '(group)|pipe',
    ];

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as never);

    try {
      await import('./main.js');
    } catch {
      // process.exit throws in test
    }

    const commandLine = `"${shimPath}" "network" "up" "name&whoami" "100^%literal^%" "C:\\tmp\\\\" "with space" "--set=a"" b" "(group)|pipe"`;
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', `"${commandLine}"`],
      expect.objectContaining({ stdio: 'inherit', shell: false, windowsVerbatimArguments: true }),
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
    expect(message).toContain('npm run local:link');
    expect(message).toContain('npm run local:verify-cli');
    expect(message).not.toContain('npm install -g @franken/orchestrator');
    expect(message).not.toContain('@fbeast/orchestrator');
    expect(mockExit).toHaveBeenCalledWith(1);
    mockError.mockRestore();
    mockExit.mockRestore();
  });

  it('maps Windows missing mcp beast handoff binary output to standalone install help', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir());
    const binDir = tmpDir();
    const shimPath = join(binDir, 'frankenbeast.CMD');
    writeFileSync(shimPath, '@echo off\r\n');
    vi.stubEnv('PATH', binDir);
    vi.stubEnv('PATHEXT', '.COM;.EXE;.BAT;.CMD');
    vi.stubEnv('ComSpec', 'C:\\Windows\\System32\\cmd.exe');
    const enoent: NodeJS.ErrnoException = Object.assign(new Error('spawn frankenbeast ENOENT'), { code: 'ENOENT' });
    const mockSpawnSync = vi.fn().mockReturnValue({
      status: null,
      signal: null,
      error: enoent,
      stdout: '',
      stderr: '',
    });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'mcp', 'beast'];

    const mockLog = vi.spyOn(console, 'info').mockImplementation(() => undefined);

    await import('./main.js');

    const message = mockLog.mock.calls.map((c) => c.join(' ')).join('\n');
    const commandLine = `"${shimPath}" "beasts" "catalog"`;
    expect(mockSpawnSync).toHaveBeenCalledWith(
      'C:\\Windows\\System32\\cmd.exe',
      ['/d', '/s', '/c', `"${commandLine}"`],
      expect.objectContaining({ stdio: 'pipe', shell: false, encoding: 'utf8', windowsVerbatimArguments: true }),
    );
    expect(message).toContain('npm run local:link');
    expect(message).toContain('npm run local:verify-cli');
    expect(message).not.toContain('npm install -g @franken/orchestrator');
    expect(message).not.toContain('npm link --workspace=franken-orchestrator');
    mockLog.mockRestore();
    cwdSpy.mockRestore();
    platformSpy.mockRestore();
  });

  it('preserves real Windows mcp beast handoff failures', async () => {
    const platformSpy = vi.spyOn(process, 'platform', 'get').mockReturnValue('win32');
    const cwdSpy = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir());
    const mockSpawnSync = vi.fn().mockReturnValue({
      status: 1,
      signal: null,
      error: undefined,
      stdout: '',
      stderr: 'catalog configuration failed',
    });
    vi.doMock('node:child_process', () => ({ spawnSync: mockSpawnSync }));

    process.argv = ['node', 'fbeast', 'mcp', 'beast'];

    await expect(import('./main.js')).rejects.toThrow('frankenbeast exited with 1');
    cwdSpy.mockRestore();
    platformSpy.mockRestore();
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
