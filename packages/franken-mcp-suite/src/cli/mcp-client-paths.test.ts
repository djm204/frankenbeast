import { describe, expect, it } from 'vitest';
import { join } from 'node:path';
import { detectMcpClient, resolveClientConfigDir } from './mcp-client-paths.js';

describe('MCP client detection', () => {
  it('resolves JSON-client config dirs to the project even when only home config exists', () => {
    const cwd = '/project';
    const homeDir = '/home/user';
    const existing = new Set([join(homeDir, '.claude'), join(homeDir, '.gemini')]);

    expect(resolveClientConfigDir({
      client: 'claude',
      cwd,
      homeDir,
      exists: (path) => existing.has(path),
    })).toBe(join(cwd, '.claude'));
    expect(resolveClientConfigDir({
      client: 'gemini',
      cwd,
      homeDir,
      exists: (path) => existing.has(path),
    })).toBe(join(cwd, '.gemini'));
  });

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

  it('prefers project Codex config over Claude project MCP config', () => {
    const cwd = '/project';
    const homeDir = '/home/user';
    const existing = new Set([
      join(cwd, '.codex'),
      join(cwd, '.mcp.json'),
      join(homeDir, '.claude'),
    ]);

    const client = detectMcpClient({
      cwd,
      homeDir,
      exists: (path) => existing.has(path),
    });

    expect(client).toBe('codex');
  });

  it('detects Claude project MCP config before home-level clients', () => {
    const cwd = '/project';
    const homeDir = '/home/user';
    const existing = new Set([
      join(cwd, '.mcp.json'),
      join(homeDir, '.gemini'),
      join(homeDir, '.codex'),
    ]);

    const client = detectMcpClient({
      cwd,
      homeDir,
      exists: (path) => existing.has(path),
    });

    expect(client).toBe('claude');
  });
});
