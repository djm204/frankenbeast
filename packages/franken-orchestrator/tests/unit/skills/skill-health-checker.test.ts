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

  it('returns connected when a trusted server exits cleanly', async () => {
    const config: McpConfig = {
      mcpServers: {
        github: { command: 'echo', args: ['ok'] },
      },
    };
    const result = await checker.getStatus('github', config, { trustMcpServerCommands: true });
    expect(result.name).toBe('github');
    expect(result.status).toBe('connected');
    expect(result.serverStatuses).toHaveLength(1);
  });

  it('returns connected when a long-running trusted MCP server responds to initialize', async () => {
    const { spawn } = await import('node:child_process');
    const proc = makeMockProcess();
    proc.stdin.write.mockImplementation((message: string) => {
      expect(message).toContain('Content-Length:');
      expect(message).toContain('"method":"initialize"');
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

  it('defers stdin EPIPE to the process close status', async () => {
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

    expect(result.status).toBe('connected');
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
      { serverName: 'silent', status: 'unknown' },
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
    kill: vi.fn(function kill(this: { killed: boolean }) {
      this.killed = true;
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
