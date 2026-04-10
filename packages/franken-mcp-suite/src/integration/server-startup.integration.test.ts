import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
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
  execFileSync('npm', ['run', 'build'], {
    cwd: PACKAGE_ROOT,
    stdio: 'pipe',
  });
});

describe('declared MCP binaries', () => {
  it('declares a real fbeast-hook binary', () => {
    const pkg = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      bin: Record<string, string>;
    };

    expect(pkg.bin['fbeast-hook']).toBe('./dist/cli/hook.js');
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
      expect(names).toContain('fbeast_skills_list');
    } finally {
      await transport.close();
      rmSync(dbDir, { recursive: true, force: true });
    }
  });
});
