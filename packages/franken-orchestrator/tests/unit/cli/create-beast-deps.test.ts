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

    const deps = createBeastDeps(
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
      },
    );

    expect(deps.mcp.getAvailableTools()).toEqual([
      {
        name: 'fbeast_memory_query',
        serverId: 'memory',
        description: 'Query memory',
        inputSchema: { type: 'object', properties: { query: { type: 'string' } }, required: ['query'] },
      },
    ]);
  });
});
