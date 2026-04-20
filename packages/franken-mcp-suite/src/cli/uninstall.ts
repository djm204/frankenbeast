#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveClientConfigDir, detectMcpClient, type McpClient } from './mcp-client-paths.js';
import { confirmYesNo } from './prompt.js';

export interface UninstallOptions {
  root: string;
  claudeDir: string;
  client?: McpClient;
  purge?: boolean | undefined;
  ask?: (question: string) => Promise<string>;
  /** Injectable spawn for testing the codex path. */
  spawn?: (cmd: string, args: string[]) => { status: number | null };
}

export async function runUninstall(options: UninstallOptions): Promise<void> {
  const { root, claudeDir, client = 'claude', ask } = options;
  const spawnFn = options.spawn ?? ((cmd, args) => spawnSync(cmd, args, { encoding: 'utf-8' }));
  const purge = options.purge ?? await confirmYesNo(
    'Remove stored data (.fbeast/)? [y/N] ',
    ask ?? defaultAsk,
  );

  if (client === 'codex') {
    uninstallCodex({ root, spawnFn });
  } else {
    uninstallJsonClient({ claudeDir, client });
  }

  const fbeastDir = join(root, '.fbeast');
  if (purge && existsSync(fbeastDir)) {
    rmSync(fbeastDir, { recursive: true, force: true });
  }

  console.log('fbeast uninstalled.');
  if (purge) {
    console.log('  Purged .fbeast/ directory and all stored data.');
  } else {
    console.log('  Stored data preserved in .fbeast/ — run with --purge to remove.');
  }
}

// ─── Claude / Gemini (settings.json-based) ───────────────────────────────────

function uninstallJsonClient(options: { claudeDir: string; client: 'claude' | 'gemini' }): void {
  const { claudeDir, client } = options;
  const settingsPath = join(claudeDir, 'settings.json');

  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));

    // Remove fbeast MCP servers
    const mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};
    for (const key of Object.keys(mcpServers)) {
      if (key.startsWith('fbeast-')) delete mcpServers[key];
    }
    settings['mcpServers'] = mcpServers;

    if (client === 'gemini') {
      // Gemini: remove BeforeTool/AfterTool entries referencing fbeast scripts
      const hooks = settings['hooks'] as Record<string, unknown> | undefined;
      if (hooks) {
        for (const hookType of ['BeforeTool', 'AfterTool'] as const) {
          const list = hooks[hookType];
          if (Array.isArray(list)) {
            hooks[hookType] = list.filter((entry: unknown) => {
              if (typeof entry !== 'object' || entry === null) return true;
              const inner = (entry as any).hooks;
              if (!Array.isArray(inner)) return true;
              return !inner.some(
                (h: any) => typeof h.command === 'string' && h.command.includes('fbeast'),
              );
            });
          }
        }
        settings['hooks'] = hooks;
      }
    } else {
      // Claude: remove preToolCall/postToolCall entries referencing fbeast
      const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
      if (hooks) {
        for (const [hookType, hookList] of Object.entries(hooks)) {
          if (Array.isArray(hookList)) {
            hooks[hookType] = hookList.filter(
              (h: any) => !h.description?.includes('fbeast') && !h.command?.includes('fbeast'),
            );
          }
        }
        settings['hooks'] = hooks;
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  const instrPath = join(claudeDir, 'fbeast-instructions.md');
  if (existsSync(instrPath)) unlinkSync(instrPath);
}

// ─── Codex ────────────────────────────────────────────────────────────────────

const ALL_SERVER_NAMES = [
  'fbeast-memory', 'fbeast-planner', 'fbeast-critique', 'fbeast-firewall',
  'fbeast-observer', 'fbeast-governor', 'fbeast-skills',
];

function uninstallCodex(options: {
  root: string;
  spawnFn: (cmd: string, args: string[]) => { status: number | null };
}): void {
  const { root, spawnFn } = options;

  // Remove MCP servers via codex mcp remove
  for (const name of ALL_SERVER_NAMES) {
    spawnFn('codex', ['mcp', 'remove', name]);
  }

  // Remove fbeast entries from .codex/hooks.json
  const hooksPath = join(root, '.codex', 'hooks.json');
  if (existsSync(hooksPath)) {
    try {
      const existing = JSON.parse(readFileSync(hooksPath, 'utf-8'));
      const hooks = existing['hooks'];
      if (hooks && typeof hooks === 'object') {
        for (const key of ['PreToolUse', 'PostToolUse'] as const) {
          if (Array.isArray(hooks[key])) {
            hooks[key] = (hooks[key] as unknown[]).filter((entry: unknown) => {
              if (typeof entry !== 'object' || entry === null) return true;
              const inner = (entry as any).hooks;
              if (!Array.isArray(inner)) return true;
              return !inner.some(
                (h: any) => typeof h.command === 'string' && h.command.includes('fbeast'),
              );
            });
          }
        }
        existing['hooks'] = hooks;
      }
      writeFileSync(hooksPath, JSON.stringify(existing, null, 2) + '\n');
    } catch { /* ignore parse errors */ }
  }
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const root = process.cwd();
  const client = detectMcpClient({ cwd: root, homeDir: homedir(), exists: existsSync });
  const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
  const purge = process.argv.includes('--purge') ? true : undefined;
  runUninstall({ root, claudeDir, purge }).catch((err) => {
    console.error('fbeast-uninstall failed:', err);
    process.exit(1);
  });
}

function defaultAsk(question: string): Promise<string> {
  if (!process.stdin.isTTY) {
    return Promise.resolve('');
  }

  return new Promise((resolve) => {
    process.stdout.write(question);
    process.stdin.resume();
    process.stdin.setEncoding('utf8');
    const finish = (answer: string) => {
      process.stdin.off('data', onData);
      process.stdin.off('end', onEnd);
      process.stdin.off('error', onError);
      process.stdin.pause();
      resolve(answer);
    };
    const onData = (data: string | Buffer) => finish(String(data));
    const onEnd = () => finish('');
    const onError = () => finish('');

    process.stdin.once('data', onData);
    process.stdin.once('end', onEnd);
    process.stdin.once('error', onError);
  });
}
