import { describe, it, expect, vi } from 'vitest';
import type { McpConfig } from '@franken/types';
import { SkillHealthChecker } from '../../../src/skills/skill-health-checker.js';

vi.mock('node:child_process', () => {
  const { EventEmitter } = require('node:events');
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

  it('returns connected when server exits cleanly', async () => {
    const config: McpConfig = {
      mcpServers: {
        github: { command: 'echo', args: ['ok'] },
      },
    };
    const result = await checker.getStatus('github', config);
    expect(result.name).toBe('github');
    expect(result.status).toBe('connected');
    expect(result.serverStatuses).toHaveLength(1);
  });

  it('handles multiple servers', async () => {
    const config: McpConfig = {
      mcpServers: {
        a: { command: 'echo' },
        b: { command: 'echo' },
      },
    };
    const result = await checker.getStatus('multi', config);
    expect(result.serverStatuses).toHaveLength(2);
  });

  it('returns error when spawn fails', async () => {
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
    const result = await checker.getStatus('bad', config);
    expect(result.status).toBe('error');
  });
});
