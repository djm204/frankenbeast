#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, rmSync, unlinkSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { resolveClientConfigDir, detectMcpClient, parseMcpClient, type McpClient } from './mcp-client-paths.js';
import { confirmYesNo } from './prompt.js';
import { codexProjectIds, codexServerNamesForProjectIds } from './codex-server-names.js';
import type { FbeastServer } from '../shared/config.js';

export interface UninstallOptions {
  root: string;
  claudeDir: string;
  client?: McpClient;
  purge?: boolean | undefined;
  ask?: (question: string) => Promise<string>;
  /** Injectable spawn for testing the codex path. */
  spawn?: (cmd: string, args: string[]) => { status: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
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
    uninstallJsonClient({ root, claudeDir, client });
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

function uninstallJsonClient(options: { root: string; claudeDir: string; client: 'claude' | 'gemini' }): void {
  const { root, claudeDir, client } = options;
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
      // Gemini: prune fbeast hooks from BeforeTool/AfterTool, keep entries with remaining hooks
      const hooks = settings['hooks'] as Record<string, unknown> | undefined;
      if (hooks) {
        for (const hookType of ['BeforeTool', 'AfterTool'] as const) {
          const list = hooks[hookType];
          if (Array.isArray(list)) {
            hooks[hookType] = list
              .map(pruneFbeastFromEntry)
              .filter((e): e is unknown => e !== null);
          }
        }
        settings['hooks'] = hooks;
      }
    } else {
      // Claude: prune fbeast hooks from PreToolUse/PostToolUse entries, keep entries with remaining hooks
      const hooks = settings['hooks'] as Record<string, unknown[]> | undefined;
      if (hooks) {
        for (const [hookType, hookList] of Object.entries(hooks)) {
          if (Array.isArray(hookList)) {
            hooks[hookType] = hookList
              .map(pruneFbeastFromEntry)
              .filter((e): e is unknown => e !== null);
          }
        }
        settings['hooks'] = hooks;
      }
    }

    writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');
  }

  const instrPath = join(claudeDir, 'fbeast-instructions.md');
  if (existsSync(instrPath)) unlinkSync(instrPath);

  if (client === 'claude') {
    removeGeneratedHookScripts(root, 'claude');
  } else if (client === 'gemini') {
    removeGeneratedHookScripts(root, 'gemini');
  }
}

// ─── Codex ────────────────────────────────────────────────────────────────────

const ALL_SERVERS: FbeastServer[] = [
  'memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills',
];

const AGENTS_MD_START = '<!-- fbeast-start -->';
const AGENTS_MD_END = '<!-- fbeast-end -->';

function uninstallCodex(options: {
  root: string;
  spawnFn: (cmd: string, args: string[]) => { status: number | null; stdout?: Buffer | string; stderr?: Buffer | string };
}): void {
  const { root, spawnFn } = options;

  const projectIds = codexProjectIds(root);
  const namesToRemove = new Set([
    ...codexServerNamesForProjectIds(projectIds, ALL_SERVERS, 'standard'),
    ...codexServerNamesForProjectIds(projectIds, ALL_SERVERS, 'proxy'),
    ...codexServerNamesFromLocalConfig(root),
    ...legacyCodexServerNamesForRoot(root, spawnFn),
  ]);

  // Remove only this project's MCP servers. Namespaced entries are scoped by a
  // persisted project id (plus the current path hash as a defensive fallback).
  // Legacy fixed names are removed only when `codex mcp list --json` proves that
  // they target this root's .fbeast database.
  for (const name of namesToRemove) {
    spawnFn('codex', ['mcp', 'remove', name]);
  }

  // Remove fbeast section from AGENTS.md
  const agentsPath = join(root, 'AGENTS.md');
  if (existsSync(agentsPath)) {
    let content = readFileSync(agentsPath, 'utf-8');
    const startIdx = content.indexOf(AGENTS_MD_START);
    const endIdx = content.indexOf(AGENTS_MD_END);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx).trimEnd() + content.slice(endIdx + AGENTS_MD_END.length);
      const trimmed = content.trimEnd();
      if (trimmed.length === 0) {
        unlinkSync(agentsPath);
      } else {
        writeFileSync(agentsPath, trimmed + '\n');
      }
    }
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
            hooks[key] = (hooks[key] as unknown[])
              .map(pruneFbeastFromEntry)
              .filter((e): e is unknown => e !== null);
          }
        }
        existing['hooks'] = hooks;
      }
      writeFileSync(hooksPath, JSON.stringify(existing, null, 2) + '\n');
    } catch { /* ignore parse errors */ }
  }

  removeCodexProjectConfigEntries(root);

  removeGeneratedHookScripts(root, 'codex');
}

function codexServerNamesFromLocalConfig(root: string): string[] {
  const configPath = join(root, '.codex', 'config.toml');
  if (!existsSync(configPath)) return [];

  const toml = readFileSync(configPath, 'utf-8');
  return toml.split(/\r?\n/).flatMap((line) => {
    const header = line.match(/^\s*\[mcp_servers\.(?:"([^"]+)"|([^\]]+))]\s*$/);
    const name = header?.[1] ?? header?.[2];
    return typeof name === 'string' && name.startsWith('fbeast-') ? [name] : [];
  });
}

function removeCodexProjectConfigEntries(root: string): void {
  const configPath = join(root, '.codex', 'config.toml');
  if (!existsSync(configPath)) return;

  const existing = readFileSync(configPath, 'utf-8');
  const cleaned = removeFbeastMcpServerTables(existing).trimEnd();
  if (cleaned.length === 0) {
    unlinkSync(configPath);
  } else {
    writeFileSync(configPath, `${cleaned}\n`);
  }
}

function removeFbeastMcpServerTables(toml: string): string {
  const lines = toml.split(/\r?\n/);
  const kept: string[] = [];
  let dropping = false;

  for (const line of lines) {
    const header = line.match(/^\s*\[([^\]]+)]\s*$/);
    if (header?.[1]) {
      dropping = /^mcp_servers\.(?:"fbeast-[^"]+"|fbeast-[A-Za-z0-9_-]+)$/.test(header[1]);
    }
    if (!dropping) kept.push(line);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function legacyCodexServerNamesForRoot(
  root: string,
  spawnFn: (cmd: string, args: string[]) => { status: number | null; stdout?: Buffer | string; stderr?: Buffer | string },
): string[] {
  const result = spawnFn('codex', ['mcp', 'list', '--json']);
  if (result.status !== 0 || result.stdout === undefined) return [];

  let entries: unknown;
  try {
    entries = JSON.parse(result.stdout.toString());
  } catch {
    return [];
  }
  if (!Array.isArray(entries)) return [];

  const legacyNames = new Set([...ALL_SERVERS.map((server) => `fbeast-${server}`), 'fbeast-proxy']);
  return entries.flatMap((entry) => {
    if (!isObjectRecord(entry)) return [];
    const name = entry['name'];
    if (typeof name !== 'string' || !legacyNames.has(name)) return [];
    return codexEntryTargetsRootDb(entry, root) ? [name] : [];
  });
}

function codexEntryTargetsRootDb(entry: Record<string, unknown>, root: string): boolean {
  const dbPath = resolve(root, '.fbeast', 'beast.db');
  const candidates = [entry, isObjectRecord(entry['transport']) ? entry['transport'] : undefined]
    .filter((value): value is Record<string, unknown> => value !== undefined);

  return candidates.some((candidate) => {
    const args = candidate['args'];
    if (!Array.isArray(args)) return false;
    return args.some((arg) => typeof arg === 'string' && resolve(arg) === dbPath);
  });
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function removeGeneratedHookScripts(root: string, client: 'claude' | 'gemini' | 'codex'): void {
  const scripts = client === 'gemini'
    ? [
      join(root, '.fbeast', 'hooks', 'gemini-before-tool.sh'),
      join(root, '.fbeast', 'hooks', 'gemini-after-tool.sh'),
    ]
    : client === 'claude'
    ? [
      join(root, '.fbeast', 'hooks', 'fbeast-claude-pre-tool.sh'),
      join(root, '.fbeast', 'hooks', 'fbeast-claude-post-tool.sh'),
    ]
    : [
      join(root, '.codex', 'hooks', 'fbeast-codex-pre-tool.sh'),
      join(root, '.codex', 'hooks', 'fbeast-codex-post-tool.sh'),
      join(root, '.fbeast', 'hooks', 'codex-pre-tool.sh'),
      join(root, '.fbeast', 'hooks', 'codex-post-tool.sh'),
    ];

  for (const script of scripts) {
    rmSync(script, { force: true });
  }
}

/**
 * Returns a copy of entry with fbeast hooks removed from its inner `hooks` array,
 * or null if the whole entry was fbeast-only (and should be dropped).
 */
function pruneFbeastFromEntry(entry: unknown): unknown | null {
  if (typeof entry !== 'object' || entry === null) return entry;
  const record = entry as Record<string, unknown>;

  if (typeof record.command === 'string') {
    return record.command.includes('fbeast') ? null : entry;
  }
  if (typeof record.description === 'string' && record.description.includes('fbeast')) {
    return null;
  }

  if (Array.isArray(record.hooks)) {
    const remaining = record.hooks.filter((hook: unknown) => {
      if (typeof hook !== 'object' || hook === null) return true;
      const cmd = (hook as Record<string, unknown>).command;
      return !(typeof cmd === 'string' && cmd.includes('fbeast'));
    });
    if (remaining.length === 0) return null;
    return { ...record, hooks: remaining };
  }

  return entry;
}

const isMain = (await import('../shared/is-main.js')).isMain(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const clientArg = parseMcpClient(process.argv.find((a) => a.startsWith('--client='))?.split('=')[1]);
  const client = clientArg ?? detectMcpClient({ cwd: root, homeDir: homedir(), exists: existsSync });
  const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
  const purge = process.argv.includes('--purge') ? true : undefined;
  runUninstall({ root, claudeDir, client, purge }).catch((err) => {
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
