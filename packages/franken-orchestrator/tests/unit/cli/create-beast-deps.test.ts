import { describe, expect, it, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildProviderList, createBeastDeps } from '../../../src/cli/create-beast-deps.js';
import { makeCritique, makeGovernor, makeLogger, makeObserver, makePlanner } from '../../helpers/stubs.js';

describe('createBeastDeps', () => {
  it('builds consolidated CLI providers from the same typed provider config used by the CLI bridge', () => {
    const providers = buildProviderList([
      {
        name: 'gemini',
        type: 'gemini-cli',
        cliPath: '/opt/bin/gemini',
        model: 'gemini-2.5-pro',
      },
    ]);

    expect(providers).toHaveLength(1);
    const [provider] = providers;
    expect(provider!.name).toBe('gemini-cli');
    expect(provider!.type).toBe('gemini-cli');
    expect(provider!.authMethod).toBe('cli-login');
    expect(provider!.capabilities).toMatchObject({
      streaming: true,
      toolUse: true,
      mcpSupport: true,
      maxContextTokens: 1_000_000,
    });
    expect((provider as { buildArgs(request: unknown): string[] }).buildArgs({})).toEqual([
      '-p',
      '--output-format',
      'stream-json',
      '--include-directories',
      process.cwd(),
      '-m',
      'gemini-2.5-pro',
    ]);
  });

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

  it('points missing-provider guidance at config instead of a nonexistent provider CLI', () => {
    const createWithoutProviders = () => createBeastDeps(
      {
        providers: [],
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

    expect(createWithoutProviders).toThrow(/consolidatedProviders/);
    expect(createWithoutProviders).not.toThrow(/frankenbeast provider add/);
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
