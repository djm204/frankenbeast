import { EventEmitter } from 'node:events';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { McpConfig } from '@franken/types';
import { SkillHealthChecker } from '../../../src/skills/skill-health-checker.js';

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    spawn: vi.fn(() => {
      const stdin = Object.assign(new EventEmitter(), {
        write: vi.fn(),
        end: vi.fn(),
      });
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin,
        kill: vi.fn(),
        pid: 123,
        exitCode: null,
        killed: false,
      });
      // Simulate process exiting successfully after 100ms.
      setTimeout(() => {
        proc.exitCode = 0;
        proc.emit('close', 0);
      }, 100);
      return proc;
    }),
  };
});

describe('SkillHealthChecker', () => {
  const checker = new SkillHealthChecker();

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('does not spawn manifest commands without explicit trust', async () => {
    const { spawn } = await import('node:child_process');
    const config: McpConfig = {
      mcpServers: {
        github: { command: 'echo', args: ['ok'] },
      },
    };

    const result = await checker.getStatus('github', config);

    expect(spawn).not.toHaveBeenCalled();
    expect(result.name).toBe('github');
    expect(result.status).toBe('unknown');
    expect(result.serverStatuses).toEqual([
      {
        serverName: 'github',
        status: 'unknown',
        error: 'MCP health check command was not executed because the skill is not trusted',
      },
    ]);
  });

  it('returns unknown with a diagnostic when a trusted command exits cleanly without an MCP handshake', async () => {
    const config: McpConfig = {
      mcpServers: {
        github: { command: 'echo', args: ['ok'] },
      },
    };
    const result = await checker.getStatus('github', config, { trustMcpServerCommands: true });
    expect(result.name).toBe('github');
    expect(result.status).toBe('unknown');
    expect(result.serverStatuses).toEqual([
      {
        serverName: 'github',
        status: 'unknown',
        error: 'MCP initialize handshake was not completed before the command exited',
      },
    ]);
  });

  it('returns connected when a long-running trusted MCP server responds to initialize', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation((message: string) => {
      expect(message).not.toContain('Content-Length:');
      expect(message.endsWith('\n')).toBe(true);
      expect(JSON.parse(message)).toMatchObject({
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
      });
      setTimeout(() => {
        proc.stdout.emit('data', formatMcpMessage({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'healthy-test-server', version: '1.0.0' },
          },
        }));
      }, 10);
      return true;
    });
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);

    const config: McpConfig = {
      mcpServers: {
        github: { command: 'node', args: ['server.js'] },
      },
    };

    const result = await checker.getStatus('github', config, { trustMcpServerCommands: true });

    expect(result.status).toBe('connected');
    expect(result.serverStatuses).toEqual([
      { serverName: 'github', status: 'connected' },
    ]);
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('defers stdin EPIPE to an unknown clean-exit result', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation(() => {
      setTimeout(() => {
        proc.stdin.emit('error', new Error('write EPIPE'));
        proc.exitCode = 0;
        proc.emit('close', 0);
      }, 10);
      return false;
    });
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    const config: McpConfig = {
      mcpServers: {
        exitsEarly: { command: 'true' },
      },
    };

    const result = await checker.getStatus('epipe', config, { trustMcpServerCommands: true });

    expect(result.status).toBe('unknown');
    expect(result.serverStatuses[0]).toMatchObject({
      status: 'unknown',
      error: 'MCP initialize handshake was not completed before the command exited',
    });
  });

  it('parses framed initialize responses by UTF-8 byte length', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation(() => {
      setTimeout(() => {
        proc.stdout.emit('data', formatMcpMessage({
          jsonrpc: '2.0',
          id: 1,
          result: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            serverInfo: { name: 'servidor-salud-é', version: '1.0.0' },
          },
        }));
      }, 10);
      return true;
    });
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    const config: McpConfig = {
      mcpServers: {
        localized: { command: 'node', args: ['server.js'] },
      },
    };

    const result = await checker.getStatus('localized', config, { trustMcpServerCommands: true });

    expect(result.status).toBe('connected');
  });

  it('preserves partial Content-Length frame headers across stdout chunks', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation(() => {
      const message = formatMcpMessage({
        jsonrpc: '2.0',
        id: 1,
        result: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          serverInfo: { name: 'chunked-test-server', version: '1.0.0' },
        },
      });
      const headerSplit = message.indexOf('\r\n') + 2;
      setTimeout(() => {
        proc.stdout.emit('data', message.slice(0, headerSplit));
        proc.stdout.emit('data', message.slice(headerSplit));
      }, 10);
      return true;
    });
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    const config: McpConfig = {
      mcpServers: {
        chunked: { command: 'node', args: ['server.js'] },
      },
    };

    const result = await checker.getStatus('chunked', config, { trustMcpServerCommands: true });

    expect(result.status).toBe('connected');
  });

  it('returns error when a trusted MCP server rejects initialize then exits cleanly', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation(() => {
      setTimeout(() => {
        proc.stdout.emit('data', formatMcpMessage({
          jsonrpc: '2.0',
          id: 1,
          error: { code: -32602, message: 'Unsupported protocol version' },
        }));
        proc.exitCode = 0;
        proc.emit('close', 0);
      }, 10);
      return true;
    });
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    const config: McpConfig = {
      mcpServers: {
        rejecting: { command: 'node', args: ['server.js'] },
      },
    };

    const result = await checker.getStatus('rejecting', config, { trustMcpServerCommands: true });

    expect(result.status).toBe('error');
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('returns unknown and cleans up when a trusted MCP server stays open without responding', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    const config: McpConfig = {
      mcpServers: {
        silent: { command: 'node', args: ['silent-server.js'] },
      },
    };

    const resultPromise = checker.getStatus('silent', config, { trustMcpServerCommands: true });
    await vi.advanceTimersByTimeAsync(2000);
    const result = await resultPromise;

    expect(result.status).toBe('unknown');
    expect(result.serverStatuses).toEqual([
      {
        serverName: 'silent',
        status: 'unknown',
        error: 'MCP initialize handshake timed out',
      },
    ]);
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('handles multiple trusted servers', async () => {
    const config: McpConfig = {
      mcpServers: {
        a: { command: 'echo' },
        b: { command: 'echo' },
      },
    };
    const result = await checker.getStatus('multi', config, { trustMcpServerCommands: true });
    expect(result.serverStatuses).toHaveLength(2);
  });

  it('runs at most four trusted MCP probes concurrently', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    let activeProbes = 0;
    let maxActiveProbes = 0;

    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const proc = makeMockProcess();
      activeProbes += 1;
      maxActiveProbes = Math.max(maxActiveProbes, activeProbes);
      setTimeout(() => {
        activeProbes -= 1;
        proc.exitCode = 0;
        proc.emit('close', 0);
      }, 100);
      return proc;
    });

    const config: McpConfig = {
      mcpServers: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          `server-${index}`,
          { command: 'echo' },
        ]),
      ),
    };

    const resultPromise = checker.getStatus('bounded', config, {
      trustMcpServerCommands: true,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.serverStatuses).toHaveLength(12);
    expect(maxActiveProbes).toBeLessThanOrEqual(4);
  });

  it('shares the four-probe limit across concurrent status checks', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    let activeProbes = 0;
    let maxActiveProbes = 0;

    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const proc = makeMockProcess();
      activeProbes += 1;
      maxActiveProbes = Math.max(maxActiveProbes, activeProbes);
      setTimeout(() => {
        activeProbes -= 1;
        proc.exitCode = 0;
        proc.emit('close', 0);
      }, 100);
      return proc;
    });
    const makeConfig = (prefix: string): McpConfig => ({
      mcpServers: Object.fromEntries(
        Array.from({ length: 6 }, (_, index) => [
          `${prefix}-${index}`,
          { command: 'echo' },
        ]),
      ),
    });

    const resultsPromise = Promise.all([
      checker.getStatus('first', makeConfig('first'), { trustMcpServerCommands: true }),
      checker.getStatus('second', makeConfig('second'), { trustMcpServerCommands: true }),
    ]);
    await vi.runAllTimersAsync();
    const results = await resultsPromise;

    expect(results[0].serverStatuses).toHaveLength(6);
    expect(results[1].serverStatuses).toHaveLength(6);
    expect(maxActiveProbes).toBeLessThanOrEqual(4);
  });

  it('keeps a concurrency slot until a probe process exits', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    let activeProbes = 0;
    let maxActiveProbes = 0;

    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const proc = makeMockProcess();
      activeProbes += 1;
      maxActiveProbes = Math.max(maxActiveProbes, activeProbes);
      proc.stdin.write.mockImplementation(() => {
        setTimeout(() => {
          proc.stdout.emit('data', formatMcpMessage({
            jsonrpc: '2.0',
            id: 1,
            result: {},
          }));
        }, 1);
        return true;
      });
      proc.kill.mockImplementation((signal?: NodeJS.Signals) => {
        proc.killed = true;
        if (signal === 'SIGKILL') {
          setTimeout(() => {
            activeProbes -= 1;
            proc.emit('exit', null, 'SIGKILL');
            proc.emit('close', null, 'SIGKILL');
          }, 1);
        }
        return true;
      });
      return proc;
    });

    const config: McpConfig = {
      mcpServers: Object.fromEntries(
        Array.from({ length: 12 }, (_, index) => [
          `server-${index}`,
          { command: 'node' },
        ]),
      ),
    };

    const resultPromise = checker.getStatus('stubborn', config, {
      trustMcpServerCommands: true,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(result.serverStatuses).toHaveLength(12);
    expect(maxActiveProbes).toBeLessThanOrEqual(4);
  });

  it('settles a probe when process termination cannot be signaled', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation(() => {
      setTimeout(() => {
        proc.stdout.emit('data', formatMcpMessage({
          jsonrpc: '2.0',
          id: 1,
          result: {},
        }));
      }, 1);
      return true;
    });
    proc.kill.mockReturnValue(false);
    (spawn as ReturnType<typeof vi.fn>).mockReturnValueOnce(proc);
    const settled = vi.fn();

    void checker.getStatus('unsignalable', {
      mcpServers: { server: { command: 'node' } },
    }, { trustMcpServerCommands: true }).then(settled);
    await vi.runAllTimersAsync();
    await Promise.resolve();

    expect(settled).toHaveBeenCalledWith({
      name: 'unsignalable',
      status: 'connected',
      serverStatuses: [{ serverName: 'server', status: 'connected' }],
    });
    expect(proc.kill).toHaveBeenCalledTimes(1);
  });

  it('skips trusted MCP probes beyond the aggregate limit', async () => {
    vi.useFakeTimers();
    const { spawn } = await import('node:child_process');
    (spawn as ReturnType<typeof vi.fn>).mockImplementation(() => {
      const proc = makeMockProcess();
      setTimeout(() => {
        proc.exitCode = 0;
        proc.emit('close', 0);
      }, 10);
      return proc;
    });
    const config: McpConfig = {
      mcpServers: Object.fromEntries(
        Array.from({ length: 25 }, (_, index) => [
          `server-${index}`,
          { command: 'echo' },
        ]),
      ),
    };

    const resultPromise = checker.getStatus('budgeted', config, {
      trustMcpServerCommands: true,
    });
    await vi.runAllTimersAsync();
    const result = await resultPromise;

    expect(spawn).toHaveBeenCalledTimes(20);
    expect(result.serverStatuses).toHaveLength(25);
    expect(result.serverStatuses.slice(20)).toEqual(
      Array.from({ length: 5 }, (_, index) => ({
        serverName: `server-${index + 20}`,
        status: 'unknown',
        error: 'MCP health probe skipped because the per-check limit of 20 servers was exceeded',
      })),
    );
  });

  it('returns error when trusted spawn fails', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      setTimeout(() => proc.emit('error', new Error('not found')), 10);
      return proc;
    });

    const config: McpConfig = {
      mcpServers: { bad: { command: 'nonexistent' } },
    };
    const result = await checker.getStatus('bad', config, { trustMcpServerCommands: true });
    expect(result.status).toBe('error');
    expect(result.serverStatuses[0]).toMatchObject({
      status: 'error',
      error: 'Failed to start MCP server: not found',
    });
  });

  it('returns sanitized stderr diagnostics when a trusted command exits non-zero', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      setTimeout(() => {
        proc.stderr.emit('data', 'startup failed: API_TOKEN=do-not-expose');
        proc.exitCode = 7;
        proc.emit('close', 7);
      }, 10);
      return proc;
    });

    const result = await checker.getStatus('broken', {
      mcpServers: { broken: { command: 'broken-server' } },
    }, { trustMcpServerCommands: true });

    expect(result.serverStatuses[0]).toMatchObject({
      status: 'error',
      error: 'MCP server exited with code 7\nstderr: startup failed: API_TOKEN=<redacted>',
    });
    expect(result.serverStatuses[0]?.error).not.toContain('do-not-expose');
  });

  it('bounds long stderr diagnostics without retaining data beyond 4096 bytes', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      setTimeout(() => {
        proc.stderr.emit('data', `old-prefix-${'x'.repeat(5000)}-recent-tail`);
        proc.exitCode = 1;
        proc.emit('close', 1);
      }, 10);
      return proc;
    });

    const result = await checker.getStatus('noisy', {
      mcpServers: { noisy: { command: 'noisy-server' } },
    }, { trustMcpServerCommands: true });
    const diagnostic = result.serverStatuses[0]?.error ?? '';

    expect(Buffer.byteLength(diagnostic, 'utf8')).toBeLessThanOrEqual(4160);
    expect(diagnostic).toContain('old-prefix');
    expect(diagnostic).not.toContain('-recent-tail');
  });

  it('redacts sensitive assignments before exposing ANSI-normalized diagnostics', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      setTimeout(() => {
        proc.stderr.emit('data', 'API_\u001b[31mTOKEN=do-not-expose');
        proc.exitCode = 1;
        proc.emit('close', 1);
      }, 10);
      return proc;
    });

    const result = await checker.getStatus('ansi', {
      mcpServers: { ansi: { command: 'ansi-server' } },
    }, { trustMcpServerCommands: true });
    const diagnostic = result.serverStatuses[0]?.error ?? '';

    expect(diagnostic).toContain('API_TOKEN=<redacted>');
    expect(diagnostic).not.toContain('do-not-expose');
    expect(diagnostic).not.toContain('\u001b');
  });

  it('does not retain a sensitive value past the diagnostic bound', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      setTimeout(() => {
        proc.stderr.emit('data', `API_TOKEN=${'s'.repeat(5000)}-secret-tail`);
        proc.exitCode = 1;
        proc.emit('close', 1);
      }, 10);
      return proc;
    });

    const result = await checker.getStatus('long-secret', {
      mcpServers: { 'long-secret': { command: 'long-secret-server' } },
    }, { trustMcpServerCommands: true });
    const diagnostic = result.serverStatuses[0]?.error ?? '';

    expect(diagnostic).toContain('API_TOKEN=<redacted>');
    expect(diagnostic).not.toContain('-secret-tail');
    expect(Buffer.byteLength(diagnostic, 'utf8')).toBeLessThanOrEqual(4160);
  });
});

function makeMockProcess() {
  const stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
  });
  return Object.assign(new EventEmitter(), {
    stdout: new EventEmitter(),
    stderr: new EventEmitter(),
    stdin,
    kill: vi.fn(function kill(
      this: EventEmitter & { killed: boolean },
      signal: NodeJS.Signals = 'SIGTERM',
    ) {
      this.killed = true;
      queueMicrotask(() => {
        this.emit('exit', null, signal);
        this.emit('close', null, signal);
      });
      return true;
    }),
    pid: 123,
    exitCode: null as number | null,
    killed: false,
  });
}

function formatMcpMessage(message: unknown): string {
  const body = JSON.stringify(message);
  return `Content-Length: ${Buffer.byteLength(body, 'utf8')}\r\n\r\n${body}`;
}
