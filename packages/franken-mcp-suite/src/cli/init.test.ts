import { describe, it, expect, afterEach } from 'vitest';
import { runInit } from './init.js';
import { resolveClientConfigDir } from './mcp-client-paths.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-init-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fbeast init', () => {
  const dirs: string[] = [];

  afterEach(() => {
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('creates .fbeast dir and config.json', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    expect(existsSync(join(root, '.fbeast', 'config.json'))).toBe(true);
    expect(existsSync(join(root, '.fbeast', 'beast.db'))).toBe(true);
  });

  it('creates .claude dir and drops instructions file', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const instrPath = join(root, '.claude', 'fbeast-instructions.md');
    expect(existsSync(instrPath)).toBe(true);
    const content = readFileSync(instrPath, 'utf-8');
    expect(content).toContain('fbeast_memory_frontload');
  });

  it('writes MCP server config to settings.json', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const settingsPath = join(root, '.claude', 'settings.json');
    expect(existsSync(settingsPath)).toBe(true);
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.mcpServers['fbeast-planner']).toBeDefined();
    expect(settings.mcpServers['fbeast-critique']).toBeDefined();
    expect(settings.mcpServers['fbeast-firewall']).toBeDefined();
    expect(settings.mcpServers['fbeast-observer']).toBeDefined();
    expect(settings.mcpServers['fbeast-governor']).toBeDefined();
    expect(settings.mcpServers['fbeast-skills']).toBeDefined();
  });

  it('merges with existing settings.json without overwriting', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    const existing = { mcpServers: { 'my-other-server': { command: 'other' } }, customKey: true };
    writeFileSync(settingsPath, JSON.stringify(existing));

    runInit({ root, claudeDir, hooks: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers['my-other-server']).toBeDefined();
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.customKey).toBe(true);
  });

  it('respects pick list', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, servers: ['memory', 'critique'] });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.mcpServers['fbeast-critique']).toBeDefined();
    expect(settings.mcpServers['fbeast-planner']).toBeUndefined();
  });

  it('writes Claude hooks when hooks are enabled', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: true });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    const dbPath = join(root, '.fbeast', 'beast.db');
    expect(settings.hooks.preToolCall).toEqual([
      {
        command: `fbeast-hook pre-tool --db "${dbPath}" $TOOL_NAME`,
        description: 'fbeast governance check',
      },
    ]);
    expect(settings.hooks.postToolCall).toEqual([
      {
        command: `fbeast-hook post-tool --db "${dbPath}" $TOOL_NAME $RESULT`,
        description: 'fbeast observer logging',
      },
    ]);
  });

  it('falls back to home config dir when no project-level dir exists', () => {
    const cwd = '/tmp/project';
    const homeDir = '/tmp/home';

    const claudeDir = resolveClientConfigDir({
      client: 'claude',
      cwd,
      homeDir,
      exists: (path) => path === join(homeDir, '.claude'),
    });

    expect(claudeDir).toBe(join(homeDir, '.claude'));
  });

  it('resolves gemini client to .gemini dir', () => {
    const cwd = '/tmp/project';
    const homeDir = '/tmp/home';

    const geminiDir = resolveClientConfigDir({
      client: 'gemini',
      cwd,
      homeDir,
      exists: (path) => path === join(homeDir, '.gemini'),
    });

    expect(geminiDir).toBe(join(homeDir, '.gemini'));
  });

  it('writes Gemini hooks and shell scripts when --client=gemini --hooks', () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');

    runInit({ root, claudeDir: geminiDir, hooks: true, client: 'gemini' });

    // Shell scripts created and executable
    const preScript = join(root, '.fbeast', 'hooks', 'gemini-before-tool.sh');
    const postScript = join(root, '.fbeast', 'hooks', 'gemini-after-tool.sh');
    expect(existsSync(preScript)).toBe(true);
    expect(existsSync(postScript)).toBe(true);
    const preContent = readFileSync(preScript, 'utf-8');
    expect(preContent).toContain('fbeast-hook pre-tool');
    expect(preContent).toContain('decision":"deny"');

    // settings.json has BeforeTool / AfterTool entries
    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf-8'));
    const beforeHooks = settings.hooks?.BeforeTool as unknown[];
    const afterHooks = settings.hooks?.AfterTool as unknown[];
    expect(Array.isArray(beforeHooks)).toBe(true);
    expect(Array.isArray(afterHooks)).toBe(true);
    const beforeCmd = (beforeHooks[0] as any).hooks[0].command as string;
    const afterCmd = (afterHooks[0] as any).hooks[0].command as string;
    expect(beforeCmd).toContain('gemini-before-tool.sh');
    expect(afterCmd).toContain('gemini-after-tool.sh');
  });

  it('merges Gemini hooks without clobbering existing BeforeTool entries', () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');
    mkdirSync(geminiDir, { recursive: true });
    const existing = {
      hooks: {
        BeforeTool: [{ hooks: [{ type: 'command', command: '/usr/local/bin/my-pre-hook' }] }],
      },
    };
    writeFileSync(join(geminiDir, 'settings.json'), JSON.stringify(existing));

    runInit({ root, claudeDir: geminiDir, hooks: true, client: 'gemini' });

    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf-8'));
    const beforeHooks = settings.hooks.BeforeTool as unknown[];
    // Original entry preserved
    expect(beforeHooks.some((e: any) => e.hooks?.[0]?.command === '/usr/local/bin/my-pre-hook')).toBe(true);
    // fbeast entry added
    expect(beforeHooks.some((e: any) => (e.hooks?.[0]?.command as string)?.includes('fbeast'))).toBe(true);
  });

  it('writes AGENTS.md with fbeast loop instructions when --client=codex', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    const agentsPath = join(root, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('fbeast_memory_frontload');
    expect(content).toContain('fbeast_governor_check');
    expect(content).toContain('<!-- fbeast-start -->');
    expect(content).toContain('<!-- fbeast-end -->');
  });

  it('merges fbeast section into existing AGENTS.md without clobbering it', () => {
    const root = tmpDir();
    dirs.push(root);
    writeFileSync(join(root, 'AGENTS.md'), '# My Project Rules\n\nAlways write tests.\n');
    const mockSpawn = () => ({ status: 0 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    const content = readFileSync(join(root, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# My Project Rules');
    expect(content).toContain('Always write tests.');
    expect(content).toContain('fbeast_memory_frontload');
  });

  it('replaces existing fbeast section on re-init', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });
    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    const content = readFileSync(join(root, 'AGENTS.md'), 'utf-8');
    // Should not have duplicate sections
    expect(content.split('<!-- fbeast-start -->').length).toBe(2); // exactly one
  });

  it('registers Codex MCP servers via spawn when --client=codex', () => {
    const root = tmpDir();
    dirs.push(root);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 0 };
    };

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    // One spawn call per server
    expect(spawnCalls.length).toBe(7);
    expect(spawnCalls.every((c) => c.cmd === 'codex')).toBe(true);
    expect(spawnCalls.every((c) => c.args[0] === 'mcp' && c.args[1] === 'add')).toBe(true);
    const names = spawnCalls.map((c) => c.args[2]);
    expect(names).toContain('fbeast-memory');
    expect(names).toContain('fbeast-governor');
  });

  it('throws when codex mcp add fails for any server', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = (_cmd: string, args: string[]) => ({
      status: args[2] === 'fbeast-memory' ? 1 : 0,
      stderr: Buffer.from('command not found'),
    });

    expect(() =>
      runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn }),
    ).toThrow('failed to register 1 server');
  });

  it('proxy mode writes single fbeast-proxy entry (not 7) for claude client', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, mode: 'proxy' });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    const keys = Object.keys(settings.mcpServers);
    expect(keys).toEqual(['fbeast-proxy']);
    expect(settings.mcpServers['fbeast-proxy']).toEqual({ command: 'fbeast-proxy', args: ['--db', join(root, '.fbeast', 'beast.db')] });
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
  });

  it('proxy mode writes single fbeast-proxy entry for gemini client', () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');

    runInit({ root, claudeDir: geminiDir, hooks: false, client: 'gemini', mode: 'proxy' });

    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf-8'));
    const keys = Object.keys(settings.mcpServers);
    expect(keys).toEqual(['fbeast-proxy']);
    expect(settings.mcpServers['fbeast-proxy']).toBeDefined();
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
  });

  it('standard mode (default) still writes 7 individual entries', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, mode: 'standard' });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(Object.keys(settings.mcpServers).length).toBe(7);
    expect(settings.mcpServers['fbeast-memory']).toBeDefined();
    expect(settings.mcpServers['fbeast-proxy']).toBeUndefined();
  });

  it('proxy mode for codex calls spawnFn once with fbeast-proxy (not 7 times)', () => {
    const root = tmpDir();
    dirs.push(root);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 0 };
    };

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn, mode: 'proxy' });

    expect(spawnCalls.length).toBe(1);
    expect(spawnCalls[0].cmd).toBe('codex');
    expect(spawnCalls[0].args[0]).toBe('mcp');
    expect(spawnCalls[0].args[1]).toBe('add');
    expect(spawnCalls[0].args[2]).toBe('fbeast-proxy');
  });

  it('proxy mode for codex throws when fbeast-proxy registration fails', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 1, stderr: Buffer.from('command not found') });

    expect(() =>
      runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn, mode: 'proxy' }),
    ).toThrow('failed to register fbeast-proxy with codex');
  });

  it('writes Codex hooks.json when --client=codex --hooks', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: true, client: 'codex', spawn: mockSpawn });

    // Shell scripts created
    const preScript = join(root, '.codex', 'hooks', 'fbeast-codex-pre-tool.sh');
    const postScript = join(root, '.codex', 'hooks', 'fbeast-codex-post-tool.sh');
    expect(existsSync(preScript)).toBe(true);
    expect(existsSync(postScript)).toBe(true);

    // hooks.json written
    const hooksPath = join(root, '.codex', 'hooks.json');
    expect(existsSync(hooksPath)).toBe(true);
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    expect(Array.isArray(hooks.hooks?.PreToolUse)).toBe(true);
    expect(Array.isArray(hooks.hooks?.PostToolUse)).toBe(true);
    const preEntry = hooks.hooks.PreToolUse[0];
    expect(preEntry.matcher).toBe('*');
    expect(preEntry.hooks[0].command).toBe(preScript);
    expect(readFileSync(preScript, 'utf-8')).toContain('fbeast-hook pre-tool');
  });
});
