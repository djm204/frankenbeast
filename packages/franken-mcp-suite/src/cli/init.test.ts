import { describe, it, expect, afterEach } from 'vitest';
import { runInit } from './init.js';
import { resolveClientConfigDir } from './mcp-client-paths.js';
import { codexServerName } from './codex-server-names.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-init-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
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
    const config = JSON.parse(readFileSync(join(root, '.fbeast', 'config.json'), 'utf-8'));
    expect(config.root).toBe(root);
  });

  it('creates .claude dir and drops conditional instructions file', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const instrPath = join(root, '.claude', 'fbeast-instructions.md');
    expect(existsSync(instrPath)).toBe(true);
    const content = readFileSync(instrPath, 'utf-8');
    expect(content).toContain('fbeast_memory_frontload');
    expect(content).toContain('When `fbeast_*` MCP tools are available');
    expect(content).toContain('If the tools are not available in your current tool schema');
    expect(content).not.toContain('You have access to fbeast MCP tools');
  });

  it('writes Claude MCP server config to project .mcp.json with project-anchored db paths', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false });

    const mcpPath = join(root, '.mcp.json');
    expect(existsSync(mcpPath)).toBe(true);
    const mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    expect(mcpConfig.mcpServers['fbeast-memory']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-planner']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-critique']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-firewall']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-observer']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-governor']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-skills']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-memory'].args).toEqual([
      '--db',
      '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db',
    ]);
    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    expect(settings.mcpServers).toBeUndefined();
  });

  it('merges with existing Claude .mcp.json comments and trailing commas without overwriting', () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const mcpPath = join(root, '.mcp.json');
    writeFileSync(mcpPath, `{
      // Existing user-managed MCP server.
      "mcpServers": {
        "my-other-server": { "command": "other" },
        "fbeast-planner": { "command": "legacy-planner" },
      },
      "customKey": true,
    }`);
    writeFileSync(join(claudeDir, 'settings.json'), JSON.stringify({
      mcpServers: {
        'fbeast-memory': { command: 'legacy-memory' },
        'other-settings-server': { command: 'other-settings-server' },
      },
    }));

    runInit({ root, claudeDir, hooks: false });

    const mcpConfig = JSON.parse(readFileSync(mcpPath, 'utf-8'));
    expect(mcpConfig.mcpServers['my-other-server']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-memory']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-planner'].command).toBe('fbeast-planner');
    expect(mcpConfig.customKey).toBe(true);
    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
    expect(settings.mcpServers['other-settings-server']).toBeDefined();
  });

  it('respects pick list', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, servers: ['memory', 'critique'] });

    const mcpConfig = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
    expect(mcpConfig.mcpServers['fbeast-memory']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-critique']).toBeDefined();
    expect(mcpConfig.mcpServers['fbeast-planner']).toBeUndefined();
  });

  it('writes Claude hooks when hooks are enabled', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: true });

    // Shell scripts created
    const preScript = join(root, '.fbeast', 'hooks', 'fbeast-claude-pre-tool.sh');
    const postScript = join(root, '.fbeast', 'hooks', 'fbeast-claude-post-tool.sh');
    expect(existsSync(preScript)).toBe(true);
    expect(existsSync(postScript)).toBe(true);

    // settings.json uses correct event names and matcher format
    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    const preHooks = settings.hooks?.PreToolUse as unknown[];
    const postHooks = settings.hooks?.PostToolUse as unknown[];
    expect(Array.isArray(preHooks)).toBe(true);
    expect(Array.isArray(postHooks)).toBe(true);
    const preCmd = (preHooks[0] as any).hooks[0].command as string;
    const postCmd = (postHooks[0] as any).hooks[0].command as string;
    expect(preCmd).toContain('fbeast-claude-pre-tool.sh');
    expect(postCmd).toContain('fbeast-claude-post-tool.sh');
  });

  it('quotes Claude hook command paths when the project path contains spaces', () => {
    const parent = tmpDir();
    dirs.push(parent);
    const root = join(parent, 'project with spaces');
    mkdirSync(root, { recursive: true });

    runInit({ root, claudeDir: join(root, '.claude'), hooks: true });

    const settings = JSON.parse(readFileSync(join(root, '.claude', 'settings.json'), 'utf-8'));
    const preCmd = (settings.hooks.PreToolUse[0] as any).hooks[0].command as string;
    const postCmd = (settings.hooks.PostToolUse[0] as any).hooks[0].command as string;

    expect(preCmd).toContain('sh -c');
    expect(preCmd).toContain('CLAUDE_PROJECT_DIR');
    expect(preCmd).toContain('cd "$p"');
    expect(preCmd).not.toContain('do;');
    expect(preCmd).toContain(join('.fbeast', 'hooks', 'fbeast-claude-pre-tool.sh').split('\\').join('/'));
    expect(postCmd).toContain('sh -c');
    expect(postCmd).toContain('CLAUDE_PROJECT_DIR');
    expect(postCmd).toContain('cd "$p"');
    expect(postCmd).not.toContain('do;');
    expect(postCmd).toContain(join('.fbeast', 'hooks', 'fbeast-claude-post-tool.sh').split('\\').join('/'));
  });

  it('uses project config dir instead of mutating home settings when no project-level dir exists yet', () => {
    const cwd = '/tmp/project';
    const homeDir = '/tmp/home';

    const claudeDir = resolveClientConfigDir({
      client: 'claude',
      cwd,
      homeDir,
      exists: (path) => path === join(homeDir, '.claude'),
    });

    expect(claudeDir).toBe(join(cwd, '.claude'));
  });

  it('resolves gemini client to project .gemini dir', () => {
    const cwd = '/tmp/project';
    const homeDir = '/tmp/home';

    const geminiDir = resolveClientConfigDir({
      client: 'gemini',
      cwd,
      homeDir,
      exists: (path) => path === join(homeDir, '.gemini'),
    });

    expect(geminiDir).toBe(join(cwd, '.gemini'));
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
    expect(beforeCmd).toContain('GEMINI_PROJECT_ROOT');
    expect(beforeCmd).toContain('cd "$p"');
    expect(beforeCmd).not.toContain('do;');
    expect(beforeCmd).toContain('gemini-before-tool.sh');
    expect(afterCmd).toContain('GEMINI_PROJECT_ROOT');
    expect(afterCmd).toContain('cd "$p"');
    expect(afterCmd).not.toContain('do;');
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

  it('writes AGENTS.md with conditional fbeast loop instructions when --client=codex', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    const agentsPath = join(root, 'AGENTS.md');
    expect(existsSync(agentsPath)).toBe(true);
    const content = readFileSync(agentsPath, 'utf-8');
    expect(content).toContain('fbeast_memory_frontload');
    expect(content).toContain('fbeast_governor_check');
    expect(content).toContain('When `fbeast_*` MCP tools are available');
    expect(content).toContain('If the tools are not available in your current tool schema');
    expect(content).not.toContain('You have access to fbeast MCP tools');
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

  it('writes Codex MCP servers to project-scoped config when --client=codex', () => {
    const root = tmpDir();
    dirs.push(root);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 1, stderr: Buffer.from('not found') };
    };

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    expect(spawnCalls.length).toBe(8);
    expect(spawnCalls.every((c) => c.cmd === 'codex')).toBe(true);
    expect(spawnCalls.every((c) => c.args[0] === 'mcp' && c.args[1] === 'get')).toBe(true);
    expect(spawnCalls.map((c) => c.args[2])).toContain('fbeast-memory');
    expect(spawnCalls.map((c) => c.args[2])).toContain('fbeast-proxy');

    const config = readFileSync(join(root, '.codex', 'config.toml'), 'utf-8');
    const names = config.match(/^\[mcp_servers\.[^\]]+]/gm) ?? [];
    expect(names.length).toBe(7);
    expect(config).toContain(`[mcp_servers.${codexServerName(root, 'memory')}]`);
    expect(config).toContain(`[mcp_servers.${codexServerName(root, 'governor')}]`);
    expect(config).not.toContain('[mcp_servers.fbeast-memory]');
    expect(config).toContain(`args = ["--db", "${join(root, '.fbeast', 'beast.db')}", "--config", "${join(root, '.fbeast', 'config.json')}"]`);
  });

  it('uses distinct Codex MCP server names for distinct project roots', () => {
    const rootA = tmpDir();
    const rootB = tmpDir();
    dirs.push(rootA, rootB);

    runInit({
      root: rootA,
      claudeDir: join(rootA, '.codex'),
      hooks: false,
      client: 'codex',
      spawn: () => ({ status: 1 }),
    });
    runInit({
      root: rootB,
      claudeDir: join(rootB, '.codex'),
      hooks: false,
      client: 'codex',
      spawn: () => ({ status: 1 }),
    });

    const configA = readFileSync(join(rootA, '.codex', 'config.toml'), 'utf-8');
    const configB = readFileSync(join(rootB, '.codex', 'config.toml'), 'utf-8');
    expect(configA).toContain(`[mcp_servers.${codexServerName(rootA, 'memory')}]`);
    expect(configB).toContain(`[mcp_servers.${codexServerName(rootB, 'memory')}]`);
    expect(codexServerName(rootA, 'memory')).not.toBe(codexServerName(rootB, 'memory'));
    expect(configA).not.toContain(codexServerName(rootB, 'memory'));
    expect(configB).not.toContain(codexServerName(rootA, 'memory'));
  });

  it('removes legacy global Codex entries only when they target the current root', () => {
    const root = tmpDir();
    dirs.push(root);
    const dbPath = join(root, '.fbeast', 'beast.db');
    const calls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      calls.push({ cmd, args });
      if (args[1] === 'get' && args[2] === 'fbeast-memory') return { status: 0, stdout: Buffer.from(`command = "fbeast-memory"\nargs = ["--db", "${dbPath}"]`) };
      if (args[1] === 'get' && args[2] === 'fbeast-planner') return { status: 0, stdout: Buffer.from('args = ["--db", "/other/project/.fbeast/beast.db"]') };
      if (args[1] === 'remove' && args[2] === 'fbeast-memory') return { status: 0 };
      return { status: 1 };
    };

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });

    expect(calls.filter((c) => c.args[1] === 'get').map((c) => c.args[2])).toEqual([
      'fbeast-memory',
      'fbeast-planner',
      'fbeast-critique',
      'fbeast-firewall',
      'fbeast-observer',
      'fbeast-governor',
      'fbeast-skills',
      'fbeast-proxy',
    ]);
    expect(calls.filter((c) => c.args[1] === 'remove').map((c) => c.args[2])).toEqual(['fbeast-memory']);
  });

  it('throws when legacy Codex removal fails', () => {
    const root = tmpDir();
    dirs.push(root);
    const dbPath = join(root, '.fbeast', 'beast.db');
    const mockSpawn = (_cmd: string, args: string[]) => {
      if (args[1] === 'get' && args[2] === 'fbeast-memory') return { status: 0, stdout: Buffer.from(dbPath) };
      if (args[1] === 'remove' && args[2] === 'fbeast-memory') return { status: 1, stderr: Buffer.from('permission denied') };
      return { status: 1 };
    };

    expect(() =>
      runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn }),
    ).toThrow('failed to remove legacy Codex MCP server fbeast-memory');
  });

  it('uses project-root placeholders for Claude .mcp.json across project roots', () => {
    const globalConfigDir = tmpDir();
    const rootA = tmpDir();
    const rootB = tmpDir();
    dirs.push(globalConfigDir, rootA, rootB);

    runInit({ root: rootA, claudeDir: globalConfigDir, hooks: false, servers: ['memory'] });

    runInit({ root: rootB, claudeDir: globalConfigDir, hooks: false, servers: ['memory'] });

    const configA = JSON.parse(readFileSync(join(rootA, '.mcp.json'), 'utf-8'));
    const configB = JSON.parse(readFileSync(join(rootB, '.mcp.json'), 'utf-8'));
    expect(configA.mcpServers['fbeast-memory']).toEqual({
      command: 'fbeast-memory',
      args: ['--db', '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db'],
    });
    expect(configB.mcpServers['fbeast-memory']).toEqual({
      command: 'fbeast-memory',
      args: ['--db', '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db'],
    });
    expect(JSON.stringify(configA.mcpServers)).not.toContain(rootA);
    expect(JSON.stringify(configB.mcpServers)).not.toContain(rootB);
  });

  it('proxy mode writes single fbeast-proxy entry (not 7) for claude client', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, mode: 'standard' });
    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, mode: 'proxy' });

    const mcpConfig = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
    const keys = Object.keys(mcpConfig.mcpServers);
    expect(keys).toEqual(['fbeast-proxy']);
    expect(mcpConfig.mcpServers['fbeast-proxy']).toEqual({
      command: 'fbeast-proxy',
      args: ['--db', '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db', '--config', join('.fbeast', 'config.json')],
    });
    expect(mcpConfig.mcpServers['fbeast-memory']).toBeUndefined();
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

  it('standard mode (default) still writes 7 individual Claude .mcp.json entries', () => {
    const root = tmpDir();
    dirs.push(root);

    runInit({ root, claudeDir: join(root, '.claude'), hooks: false, mode: 'standard' });

    const mcpConfig = JSON.parse(readFileSync(join(root, '.mcp.json'), 'utf-8'));
    expect(Object.keys(mcpConfig.mcpServers).length).toBe(7);
    expect(mcpConfig.mcpServers['fbeast-memory']).toEqual({
      command: 'fbeast-memory',
      args: ['--db', '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db'],
    });
    expect(mcpConfig.mcpServers['fbeast-firewall']).toEqual({
      command: 'fbeast-firewall',
      args: ['--db', '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db', '--config', join('.fbeast', 'config.json')],
    });
    expect(mcpConfig.mcpServers['fbeast-proxy']).toBeUndefined();
  });

  it('proxy mode for codex writes only the project-scoped fbeast-proxy entry', () => {
    const root = tmpDir();
    dirs.push(root);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 1 };
    };

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn, mode: 'proxy' });

    expect(spawnCalls.length).toBe(8);
    expect(spawnCalls.every((c) => c.args[0] === 'mcp' && c.args[1] === 'get')).toBe(true);
    const config = readFileSync(join(root, '.codex', 'config.toml'), 'utf-8');
    expect(config.match(/^\[mcp_servers\.[^\]]+]/gm)).toEqual([`[mcp_servers.${codexServerName(root, 'proxy')}]`]);
    expect(config).toContain('command = "fbeast-proxy"');
    expect(config).toContain(`args = ["--db", "${join(root, '.fbeast', 'beast.db')}", "--root", "${root}", "--config", "${join(root, '.fbeast', 'config.json')}"]`);
    expect(config).not.toContain('fbeast-memory');
  });

  it('codex re-init removes fbeast MCP subtables without deleting TOML array sections', () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 1 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });
    const oldMemoryName = codexServerName(root, 'memory');
    const configPath = join(root, '.codex', 'config.toml');
    writeFileSync(configPath, `${readFileSync(configPath, 'utf-8')}\n` + [
      `[mcp_servers.${oldMemoryName}.tools.fbeast_memory_store]`,
      'enabled = true',
      '',
      '[[hooks.PreToolUse]]',
      'command = "keep-me"',
      '',
    ].join('\n'));

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn, mode: 'proxy' });

    const config = readFileSync(configPath, 'utf-8');
    expect(config).toContain(`[mcp_servers.${codexServerName(root, 'proxy')}]`);
    expect(config).toContain('[[hooks.PreToolUse]]');
    expect(config).toContain('command = "keep-me"');
    expect(config).not.toContain(oldMemoryName);
    expect(config).not.toContain('fbeast_memory_store');
  });

  it('writes shell-quoted Codex hooks.json commands when --client=codex --hooks', () => {
    const parent = tmpDir();
    dirs.push(parent);
    const root = join(parent, `project with spaces & semi;quote's`);
    mkdirSync(root, { recursive: true });
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
    expect(preEntry.hooks[0].command).toBe(shellQuote(preScript));
    expect(hooks.hooks.PostToolUse[0].hooks[0].command).toBe(shellQuote(postScript));
    expect(readFileSync(preScript, 'utf-8')).toContain('fbeast-hook pre-tool');
  });
});
