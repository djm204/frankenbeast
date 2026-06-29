import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createBeastDeps } from '../../../src/cli/create-beast-deps.js';
import { makeCritique, makeGovernor, makeLogger, makeObserver, makePlanner } from '../../helpers/stubs.js';

describe('createBeastDeps', () => {
  it('populates the MCP adapter catalog from enabled skill tool manifests', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-create-deps-'));
    const skillsDir = join(root, 'skills');
    const configDir = join(root, '.fbeast');
    const skillDir = join(skillsDir, 'memory');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ skills: { enabled: ['memory'] } }));
    writeFileSync(join(skillDir, 'mcp.json'), JSON.stringify({ mcpServers: { memory: { command: 'memory-server' } } }));
    writeFileSync(join(skillDir, 'tools.json'), JSON.stringify([
      {
        name: 'fbeast_memory_query',
        description: 'Query memory',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ]));

    const deps = createDeps(skillsDir, configDir);

    expect(deps.mcp!.getAvailableTools()).toEqual([
      {
        name: 'fbeast_memory_query',
        serverId: 'memory',
        description: 'Query memory',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ]);
  });

  it('preserves the skill-name alias when the mcp server key is renamed', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-create-deps-'));
    const skillsDir = join(root, 'skills');
    const configDir = join(root, '.fbeast');
    const skillDir = join(skillsDir, 'memory-skill');
    mkdirSync(skillDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    writeFileSync(join(configDir, 'config.json'), JSON.stringify({ skills: { enabled: ['memory-skill'] } }));
    writeFileSync(join(skillDir, 'mcp.json'), JSON.stringify({ mcpServers: { actualMemoryServer: { command: 'memory-server' } } }));
    writeFileSync(join(skillDir, 'tools.json'), JSON.stringify([
      { name: 'query', description: 'Query', inputSchema: {} },
    ]));

    const deps = createDeps(skillsDir, configDir);

    expect(deps.mcp!.getAvailableTools()).toEqual([
      { name: 'query', serverId: 'memory-skill', description: 'Query', inputSchema: {} },
    ]);
  });

  it('uses an injected live MCP module when provided', () => {
    const root = mkdtempSync(join(tmpdir(), 'franken-create-deps-'));
    const skillsDir = join(root, 'skills');
    const configDir = join(root, '.fbeast');
    mkdirSync(skillsDir, { recursive: true });
    mkdirSync(configDir, { recursive: true });
    const liveMcp = {
      callTool: vi.fn(async () => ({ content: 'ok', isError: false })),
      getAvailableTools: vi.fn(() => [{ name: 'runtime', serverId: 'live', description: 'Runtime tool' }]),
    };

    const deps = createDeps(skillsDir, configDir, { mcp: liveMcp });

    expect(deps.mcp).toBe(liveMcp);
  });
});

function createDeps(
  skillsDir: string,
  configDir: string,
  overrides: Partial<Parameters<typeof createBeastDeps>[1]> = {},
) {
  return createBeastDeps(
    {
      providers: [{ name: 'claude', type: 'claude-cli' }],
      skillsDir,
      configDir,
      reflection: false,
    },
    {
      planner: makePlanner(),
      critique: makeCritique(),
      governor: makeGovernor(),
      observer: makeObserver(),
      logger: makeLogger(),
      clock: vi.fn(() => new Date('2026-01-01T00:00:00Z')),
      ...overrides,
    },
  );
}
