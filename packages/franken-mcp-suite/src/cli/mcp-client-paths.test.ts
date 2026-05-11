import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { detectMcpClient } from './mcp-client-paths.js';

describe('MCP client detection', () => {
  it('prefers project Codex config over home-level JSON clients', () => {
    const cwd = '/project';
    const homeDir = '/home/user';
    const existing = new Set([
      join(cwd, '.codex'),
      join(homeDir, '.claude'),
      join(homeDir, '.gemini'),
    ]);

    const client = detectMcpClient({
      cwd,
      homeDir,
      exists: (path) => existing.has(path),
    });

    expect(client).toBe('codex');
  });

  it('prefers project JSON clients over project Codex config', () => {
    const cwd = '/project';
    const homeDir = '/home/user';
    const existing = new Set([
      join(cwd, '.codex'),
      join(cwd, '.gemini'),
    ]);

    const client = detectMcpClient({
      cwd,
      homeDir,
      exists: (path) => existing.has(path),
    });

    expect(client).toBe('gemini');
  });
});
