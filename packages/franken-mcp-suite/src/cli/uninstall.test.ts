import { describe, it, expect, afterEach, vi } from 'vitest';
import { runUninstall } from './uninstall.js';
import { runInit } from './init.js';
import { confirmYesNo } from './prompt.js';
import { codexServerName, codexServerNames } from './codex-server-names.js';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { PassThrough } from 'node:stream';

function tmpDir(): string {
  const dir = join(tmpdir(), `fbeast-uninst-${randomUUID()}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}

describe('fbeast uninstall', () => {
  const dirs: string[] = [];

  afterEach(() => {
    vi.restoreAllMocks();
    for (const d of dirs) {
      if (existsSync(d)) rmSync(d, { recursive: true, force: true });
    }
    dirs.length = 0;
  });

  it('removes fbeast MCP entries from settings.json', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    await runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    expect(settings.mcpServers['fbeast-memory']).toBeUndefined();
    expect(settings.mcpServers['fbeast-planner']).toBeUndefined();
  });

  it('preserves non-fbeast MCP entries', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    const settingsPath = join(claudeDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.mcpServers['my-server'] = { command: 'my-cmd' };
    writeFileSync(settingsPath, JSON.stringify(settings));

    await runUninstall({ root, claudeDir, purge: false });

    const after = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(after.mcpServers['my-server']).toBeDefined();
    expect(after.mcpServers['fbeast-memory']).toBeUndefined();
  });

  it('removes fbeast-instructions.md', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    expect(existsSync(join(claudeDir, 'fbeast-instructions.md'))).toBe(true);

    await runUninstall({ root, claudeDir, purge: false });
    expect(existsSync(join(claudeDir, 'fbeast-instructions.md'))).toBe(false);
  });

  it('keeps .fbeast/ dir without purge', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    await runUninstall({ root, claudeDir, purge: false });

    expect(existsSync(join(root, '.fbeast'))).toBe(true);
  });

  it('removes .fbeast/ dir with purge', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });
    await runUninstall({ root, claudeDir, purge: true });

    expect(existsSync(join(root, '.fbeast'))).toBe(false);
  });

  it('removes fbeast hooks from settings.json', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: true });
    const preScript = join(root, '.fbeast', 'hooks', 'fbeast-claude-pre-tool.sh');
    const postScript = join(root, '.fbeast', 'hooks', 'fbeast-claude-post-tool.sh');
    expect(existsSync(preScript)).toBe(true);
    expect(existsSync(postScript)).toBe(true);

    await runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(join(claudeDir, 'settings.json'), 'utf-8'));
    const preHooks = settings.hooks?.PreToolUse ?? [];
    const postHooks = settings.hooks?.PostToolUse ?? [];
    const hasFbeastPre = preHooks.some((e: any) => e.hooks?.[0]?.command?.includes('fbeast'));
    const hasFbeastPost = postHooks.some((e: any) => e.hooks?.[0]?.command?.includes('fbeast'));
    expect(hasFbeastPre).toBe(false);
    expect(hasFbeastPost).toBe(false);
    expect(existsSync(preScript)).toBe(false);
    expect(existsSync(postScript)).toBe(false);
  });

  it('removes legacy Claude top-level hook entries from settings.json', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');
    mkdirSync(claudeDir, { recursive: true });
    const settingsPath = join(claudeDir, 'settings.json');
    writeFileSync(settingsPath, JSON.stringify({
      mcpServers: {
        'fbeast-memory': { command: 'fbeast-memory' },
        external: { command: 'external' },
      },
      hooks: {
        preToolCall: [
          { command: 'fbeast-hook pre-tool --db /tmp/beast.db $TOOL_NAME', description: 'fbeast governance check' },
          { command: 'external-pre', description: 'keep me' },
        ],
        postToolCall: [
          { command: 'fbeast-hook post-tool --db /tmp/beast.db $TOOL_NAME $RESULT', description: 'fbeast observer logging' },
          { command: 'external-post', description: 'keep me' },
        ],
      },
    }, null, 2));

    await runUninstall({ root, claudeDir, purge: false });

    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    expect(settings.mcpServers).toEqual({ external: { command: 'external' } });
    expect(settings.hooks.preToolCall).toEqual([{ command: 'external-pre', description: 'keep me' }]);
    expect(settings.hooks.postToolCall).toEqual([{ command: 'external-post', description: 'keep me' }]);
  });

  it('accepts yes answers for purge confirmation prompts', async () => {
    await expect(confirmYesNo('Remove stored data?', async () => 'yes')).resolves.toBe(true);
    await expect(confirmYesNo('Remove stored data?', async () => 'Y')).resolves.toBe(true);
  });

  it('prompts before purge when explicit decision is missing', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    await runUninstall({
      root,
      claudeDir,
      ask: async () => 'yes',
    });

    expect(existsSync(join(root, '.fbeast'))).toBe(false);
  });

  it('removes Gemini BeforeTool/AfterTool fbeast entries on uninstall', async () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');

    runInit({ root, claudeDir: geminiDir, hooks: true, client: 'gemini' });
    await runUninstall({ root, claudeDir: geminiDir, client: 'gemini', purge: false });

    const settings = JSON.parse(readFileSync(join(geminiDir, 'settings.json'), 'utf-8'));
    const before = (settings.hooks?.BeforeTool ?? []) as unknown[];
    const after = (settings.hooks?.AfterTool ?? []) as unknown[];
    const hasFbeast = (list: unknown[]) =>
      list.some((e: any) => e.hooks?.some((h: any) => h.command?.includes('fbeast')));
    expect(hasFbeast(before)).toBe(false);
    expect(hasFbeast(after)).toBe(false);
  });

  it('removes generated Gemini hook scripts without purging stored data', async () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');
    const preScript = join(root, '.fbeast', 'hooks', 'gemini-before-tool.sh');
    const postScript = join(root, '.fbeast', 'hooks', 'gemini-after-tool.sh');

    runInit({ root, claudeDir: geminiDir, hooks: true, client: 'gemini' });
    expect(existsSync(preScript)).toBe(true);
    expect(existsSync(postScript)).toBe(true);

    await runUninstall({ root, claudeDir: geminiDir, client: 'gemini', purge: false });

    expect(existsSync(preScript)).toBe(false);
    expect(existsSync(postScript)).toBe(false);
    expect(existsSync(join(root, '.fbeast'))).toBe(true);
  });

  it('removes fbeast section from AGENTS.md on codex uninstall', async () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });

    writeFileSync(join(root, 'AGENTS.md'), '# My Rules\n\nAlways write tests.\n');
    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });
    await runUninstall({ root, claudeDir: join(root, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    const content = readFileSync(join(root, 'AGENTS.md'), 'utf-8');
    expect(content).toContain('# My Rules');
    expect(content).not.toContain('fbeast');
  });

  it('deletes AGENTS.md entirely if fbeast was the only content', async () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });

    runInit({ root, claudeDir: join(root, '.codex'), hooks: false, client: 'codex', spawn: mockSpawn });
    await runUninstall({ root, claudeDir: join(root, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    expect(existsSync(join(root, 'AGENTS.md'))).toBe(false);
  });

  it('removes Codex MCP servers and hooks.json entries on uninstall', async () => {
    const root = tmpDir();
    dirs.push(root);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 0 };
    };

    runInit({ root, claudeDir: join(root, '.codex'), hooks: true, client: 'codex', spawn: mockSpawn });
    spawnCalls.length = 0; // reset after init

    await runUninstall({ root, claudeDir: join(root, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    // Uninstall removes the persisted project-id names plus the legacy current-path
    // fallback names for older path-derived registrations.
    const removeCalls = spawnCalls.filter((c) => c.args[0] === 'mcp' && c.args[1] === 'remove');
    const removedNames = removeCalls.map((c) => c.args[2]);
    expect(removeCalls.length).toBe(16);
    expect(removedNames).toEqual(expect.arrayContaining([
      ...codexServerNames(root, ['memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills'], 'standard'),
      codexServerName(root, 'proxy'),
    ]));

    // hooks.json has no fbeast entries left
    const hooksPath = join(root, '.codex', 'hooks.json');
    const hooks = JSON.parse(readFileSync(hooksPath, 'utf-8'));
    const preToolUse = (hooks.hooks?.PreToolUse ?? []) as unknown[];
    const postToolUse = (hooks.hooks?.PostToolUse ?? []) as unknown[];
    const hasFbeast = (list: unknown[]) =>
      list.some((e: any) => e.hooks?.some((h: any) => h.command?.includes('fbeast')));
    expect(hasFbeast(preToolUse)).toBe(false);
    expect(hasFbeast(postToolUse)).toBe(false);
  });

  it('removes generated Codex hook scripts on uninstall', async () => {
    const root = tmpDir();
    dirs.push(root);
    const mockSpawn = () => ({ status: 0 });
    const preScript = join(root, '.codex', 'hooks', 'fbeast-codex-pre-tool.sh');
    const postScript = join(root, '.codex', 'hooks', 'fbeast-codex-post-tool.sh');
    const legacyHooksDir = join(root, '.fbeast', 'hooks');
    const legacyPreScript = join(legacyHooksDir, 'codex-pre-tool.sh');
    const legacyPostScript = join(legacyHooksDir, 'codex-post-tool.sh');

    runInit({ root, claudeDir: join(root, '.codex'), hooks: true, client: 'codex', spawn: mockSpawn });
    mkdirSync(legacyHooksDir, { recursive: true });
    writeFileSync(legacyPreScript, '#!/usr/bin/env bash\n');
    writeFileSync(legacyPostScript, '#!/usr/bin/env bash\n');
    expect(existsSync(preScript)).toBe(true);
    expect(existsSync(postScript)).toBe(true);
    expect(existsSync(legacyPreScript)).toBe(true);
    expect(existsSync(legacyPostScript)).toBe(true);

    await runUninstall({ root, claudeDir: join(root, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    expect(existsSync(preScript)).toBe(false);
    expect(existsSync(postScript)).toBe(false);
    expect(existsSync(legacyPreScript)).toBe(false);
    expect(existsSync(legacyPostScript)).toBe(false);
  });

  it('codex uninstall runs codex mcp remove for the project namespaced fbeast-proxy', async () => {
    const root = tmpDir();
    dirs.push(root);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 0 };
    };

    await runUninstall({ root, claudeDir: join(root, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    const removedNames = spawnCalls
      .filter((c) => c.args[0] === 'mcp' && c.args[1] === 'remove')
      .map((c) => c.args[2]);
    expect(removedNames).toContain(codexServerName(root, 'proxy'));
    expect(removedNames).not.toContain('fbeast-proxy');
  });

  it('codex uninstall removes only this project names and does not target another project', async () => {
    const rootA = tmpDir();
    const rootB = tmpDir();
    dirs.push(rootA, rootB);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return { status: 0 };
    };

    await runUninstall({ root: rootA, claudeDir: join(rootA, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    const removedNames = spawnCalls
      .filter((c) => c.args[0] === 'mcp' && c.args[1] === 'remove')
      .map((c) => c.args[2]);
    const projectANames = [
      ...codexServerNames(rootA, ['memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills'], 'standard'),
      codexServerName(rootA, 'proxy'),
    ];
    const projectBNames = [
      ...codexServerNames(rootB, ['memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills'], 'standard'),
      codexServerName(rootB, 'proxy'),
    ];

    expect(removedNames).toEqual(projectANames);
    expect(removedNames.some((name) => projectBNames.includes(name))).toBe(false);
    expect(removedNames).not.toContain('fbeast-memory');
  });

  it('codex uninstall removes legacy fixed names only when they target this root', async () => {
    const root = tmpDir();
    const otherRoot = tmpDir();
    dirs.push(root, otherRoot);
    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      if (args[0] === 'mcp' && args[1] === 'list') {
        return {
          status: 0,
          stdout: JSON.stringify([
            { name: 'fbeast-memory', transport: { type: 'stdio', command: 'fbeast-memory', args: ['--db', join(root, '.fbeast', 'beast.db')] } },
            { name: 'fbeast-planner', transport: { type: 'stdio', command: 'fbeast-planner', args: ['--db', join(otherRoot, '.fbeast', 'beast.db')] } },
            { name: 'github', transport: { type: 'streamable_http', url: 'https://example.invalid/mcp' } },
          ]),
        };
      }
      return { status: 0 };
    };

    await runUninstall({ root, claudeDir: join(root, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    const removedNames = spawnCalls
      .filter((c) => c.args[0] === 'mcp' && c.args[1] === 'remove')
      .map((c) => c.args[2]);
    expect(removedNames).toContain('fbeast-memory');
    expect(removedNames).not.toContain('fbeast-planner');
    expect(removedNames).not.toContain('github');
  });

  it('codex uninstall removes persisted project-id names after a project move', async () => {
    const oldRoot = tmpDir();
    const movedRoot = tmpDir();
    dirs.push(oldRoot, movedRoot);
    const initSpawn = () => ({ status: 0 });

    runInit({ root: oldRoot, claudeDir: join(oldRoot, '.codex'), hooks: false, client: 'codex', spawn: initSpawn });
    const oldProjectId = readFileSync(join(oldRoot, '.fbeast', 'codex-project-id'), 'utf-8').trim();
    mkdirSync(join(movedRoot, '.fbeast'), { recursive: true });
    writeFileSync(join(movedRoot, '.fbeast', 'codex-project-id'), `${oldProjectId}\n`);

    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return args[0] === 'mcp' && args[1] === 'list'
        ? { status: 0, stdout: '[]' }
        : { status: 0 };
    };

    await runUninstall({ root: movedRoot, claudeDir: join(movedRoot, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    const removedNames = spawnCalls
      .filter((c) => c.args[0] === 'mcp' && c.args[1] === 'remove')
      .map((c) => c.args[2]);
    expect(removedNames).toContain(`fbeast-memory-${oldProjectId}`);
    expect(removedNames).toContain(codexServerName(movedRoot, 'memory'));
  });

  it('codex uninstall removes project-scoped names from moved local config', async () => {
    const oldRoot = tmpDir();
    const movedRoot = tmpDir();
    dirs.push(oldRoot, movedRoot);
    const oldCodexName = codexServerName(oldRoot, 'memory');

    mkdirSync(join(movedRoot, '.codex'), { recursive: true });
    writeFileSync(join(movedRoot, '.codex', 'config.toml'), [
      '[mcp_servers.github]',
      'command = "github-mcp"',
      '',
      `[mcp_servers.${oldCodexName}]`,
      'command = "fbeast-memory"',
      `args = ["--db", "${join(oldRoot, '.fbeast', 'beast.db')}"]`,
      '',
      `[mcp_servers.${oldCodexName}.tools.fbeast_memory_store]`,
      'enabled = true',
      '',
      '[[hooks.PreToolUse]]',
      'command = "keep-me"',
      '',
    ].join('\n'));

    const spawnCalls: Array<{ cmd: string; args: string[] }> = [];
    const mockSpawn = (cmd: string, args: string[]) => {
      spawnCalls.push({ cmd, args });
      return args[0] === 'mcp' && args[1] === 'list'
        ? { status: 0, stdout: '[]' }
        : { status: 0 };
    };

    await runUninstall({ root: movedRoot, claudeDir: join(movedRoot, '.codex'), client: 'codex', purge: false, spawn: mockSpawn });

    const removedNames = spawnCalls
      .filter((c) => c.args[0] === 'mcp' && c.args[1] === 'remove')
      .map((c) => c.args[2]);
    expect(removedNames).toContain(oldCodexName);
    const remainingConfig = readFileSync(join(movedRoot, '.codex', 'config.toml'), 'utf-8');
    expect(remainingConfig).toContain('[mcp_servers.github]');
    expect(remainingConfig).toContain('[[hooks.PreToolUse]]');
    expect(remainingConfig).toContain('command = "keep-me"');
    expect(remainingConfig).not.toContain(oldCodexName);
    expect(remainingConfig).not.toContain('fbeast_memory_store');
  });

  it('preserves non-fbeast hooks sharing a Claude matcher entry on uninstall', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: true });

    // Inject a non-fbeast handler into the same PreToolUse entry list
    const settingsPath = join(claudeDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.hooks.PreToolUse.push({
      matcher: 'Bash',
      hooks: [
        { type: 'command', command: '/path/to/fbeast-hook.sh' },
        { type: 'command', command: '/path/to/user-custom-hook.sh' },
      ],
    });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    await runUninstall({ root, claudeDir, purge: false });

    const updated = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const preList = (updated.hooks?.PreToolUse ?? []) as unknown[];
    const hasFbeast = preList.some((e: any) =>
      e.hooks?.some((h: any) => h.command?.includes('fbeast')),
    );
    const hasCustom = preList.some((e: any) =>
      e.hooks?.some((h: any) => h.command === '/path/to/user-custom-hook.sh'),
    );
    expect(hasFbeast).toBe(false);
    expect(hasCustom).toBe(true);
  });

  it('preserves non-fbeast hooks sharing a Gemini BeforeTool entry on uninstall', async () => {
    const root = tmpDir();
    dirs.push(root);
    const geminiDir = join(root, '.gemini');

    runInit({ root, claudeDir: geminiDir, hooks: true, client: 'gemini' });

    // Inject a mixed entry: fbeast hook + user hook in the same BeforeTool group
    const settingsPath = join(geminiDir, 'settings.json');
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    settings.hooks.BeforeTool.push({
      hooks: [
        { type: 'command', command: '/path/to/fbeast-before.sh' },
        { type: 'command', command: '/path/to/user-before-hook.sh' },
      ],
    });
    writeFileSync(settingsPath, JSON.stringify(settings, null, 2));

    await runUninstall({ root, claudeDir: geminiDir, client: 'gemini', purge: false });

    const updated = JSON.parse(readFileSync(settingsPath, 'utf-8'));
    const beforeList = (updated.hooks?.BeforeTool ?? []) as unknown[];
    const hasFbeast = beforeList.some((e: any) =>
      e.hooks?.some((h: any) => h.command?.includes('fbeast')),
    );
    const hasCustom = beforeList.some((e: any) =>
      e.hooks?.some((h: any) => h.command === '/path/to/user-before-hook.sh'),
    );
    expect(hasFbeast).toBe(false);
    expect(hasCustom).toBe(true);
  });

  it('treats closed stdin as a no answer when purge decision is missing', async () => {
    const root = tmpDir();
    dirs.push(root);
    const claudeDir = join(root, '.claude');

    runInit({ root, claudeDir, hooks: false });

    const stdin = Object.assign(new PassThrough(), { isTTY: false });
    const stdout = new PassThrough();
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stdin as typeof process.stdin);
    vi.spyOn(process, 'stdout', 'get').mockReturnValue(stdout as typeof process.stdout);

    const uninstallPromise = runUninstall({ root, claudeDir });
    stdin.end();

    await expect(Promise.race([
      uninstallPromise.then(() => 'completed'),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('timed out waiting for uninstall')), 50)),
    ])).resolves.toBe('completed');

    expect(existsSync(join(root, '.fbeast'))).toBe(true);
  });
});
