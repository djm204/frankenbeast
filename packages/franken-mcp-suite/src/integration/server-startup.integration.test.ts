import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const PACKAGE_ROOT = process.cwd();
const DIST_ROOT = join(PACKAGE_ROOT, 'dist');

const SERVER_BINS = [
  ['memory', 'servers/memory.js', 'fbeast_memory_query'],
  ['planner', 'servers/planner.js', 'fbeast_plan_decompose'],
  ['critique', 'servers/critique.js', 'fbeast_critique_evaluate'],
  ['firewall', 'servers/firewall.js', 'fbeast_firewall_scan'],
  ['observer', 'servers/observer.js', 'fbeast_observer_log'],
  ['governor', 'servers/governor.js', 'fbeast_governor_check'],
  ['skills', 'servers/skills.js', 'fbeast_skills_list'],
] as const;

beforeAll(() => {
  if (process.env['CI'] === 'true' && existsSync(join(DIST_ROOT, 'beast.js'))) {
    return;
  }
  execFileSync('npm', ['run', 'build'], {
    cwd: PACKAGE_ROOT,
    stdio: 'pipe',
  });
}, 60_000);

describe('declared MCP binaries', () => {
  it('declares a real fbeast-hook binary', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      bin: Record<string, string>;
    };

    expect(pkg.bin['fbeast-hook']).toBe('./dist/cli/hook.js');
    expect(pkg.bin['fbeast-proxy']).toBe('./dist/servers/proxy.js');
  });

  for (const [name, relPath, expectedTool] of SERVER_BINS) {
    it(`starts ${name} over stdio and exposes ${expectedTool}`, async () => {
      const dbDir = mkdtempSync(join(tmpdir(), `fbeast-${name}-`));
      const dbPath = join(dbDir, 'beast.db');
      const transport = new StdioClientTransport({
        command: 'node',
        args: [join(DIST_ROOT, relPath), '--db', dbPath],
        cwd: PACKAGE_ROOT,
        stderr: 'pipe',
      });
      const client = new Client({ name: 'fbeast-smoke', version: '0.0.0' });

      try {
        await client.connect(transport);
        const tools = await client.listTools();
        expect(tools.tools.some((tool) => tool.name === expectedTool)).toBe(true);
      } finally {
        await transport.close();
        rmSync(dbDir, { recursive: true, force: true });
      }
    });
  }

  it('starts the combined server and exposes tools from multiple modules', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'fbeast-combined-'));
    const dbPath = join(dbDir, 'beast.db');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [join(DIST_ROOT, 'beast.js'), '--db', dbPath],
      cwd: PACKAGE_ROOT,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'fbeast-smoke', version: '0.0.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);

      expect(names).toContain('fbeast_memory_query');
      expect(names).toContain('fbeast_firewall_scan');
      expect(names).toContain('fbeast_governor_check');
      expect(names).toContain('fbeast_skills_list');
    } finally {
      await transport.close();
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it('starts the proxy server and exposes only proxy meta-tools', async () => {
    const dbDir = mkdtempSync(join(tmpdir(), 'fbeast-proxy-'));
    const dbPath = join(dbDir, 'beast.db');
    const transport = new StdioClientTransport({
      command: 'node',
      args: [join(DIST_ROOT, 'servers/proxy.js'), '--db', dbPath],
      cwd: PACKAGE_ROOT,
      stderr: 'pipe',
    });
    const client = new Client({ name: 'fbeast-smoke', version: '0.0.0' });

    try {
      await client.connect(transport);
      const tools = await client.listTools();
      const names = tools.tools.map((tool) => tool.name);

      expect(names).toEqual(['search_tools', 'execute_tool']);
    } finally {
      await transport.close();
      rmSync(dbDir, { recursive: true, force: true });
    }
  });

  it('documents the shipped MCP mode and Beast mode split in the root README', () => {
    const readme = readFileSync(join(PACKAGE_ROOT, '..', '..', 'README.md'), 'utf8');

    expect(readme).toContain('## Modes');
    expect(readme).toContain('`MCP mode`');
    expect(readme).toContain('`Beast mode`');
    expect(readme).toContain('Both modes share `.fbeast/beast.db`.');
  });

  it('documents the dashboard as the primary Beast operator UI', () => {
    const readme = readFileSync(join(PACKAGE_ROOT, '..', 'franken-web', 'README.md'), 'utf8');

    expect(readme).toContain('## Launch Role');
    expect(readme).toContain('primary Beast operator UI');
    expect(readme).toContain('CLI users can perform the same core operations through `frankenbeast beasts`.');
  });
});
