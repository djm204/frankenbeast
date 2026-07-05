import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { McpConfig } from '@franken/types';
import { SkillHealthChecker } from '../../../src/skills/skill-health-checker.js';

vi.mock('node:child_process', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    spawn: vi.fn(() => {
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(),
        pid: 123,
      });
      // Simulate process exiting successfully after 100ms
      setTimeout(() => proc.emit('close', 0), 100);
      return proc;
    }),
  };
});

describe('SkillHealthChecker', () => {
  const checker = new SkillHealthChecker();

  beforeEach(() => {
    vi.clearAllMocks();
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
    const { EventEmitter } = await import('node:events');
    (spawn as ReturnType<typeof vi.fn>).mockImplementationOnce(() => {
      const proc = Object.assign(new EventEmitter(), {
        stdout: new EventEmitter(),
        stderr: new EventEmitter(),
        stdin: { write: vi.fn(), end: vi.fn() },
        kill: vi.fn(),
      });
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
