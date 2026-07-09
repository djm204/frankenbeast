#!/usr/bin/env node

function printLine(...args: unknown[]): void {
  console.info(...args);
}

import { FbeastConfig, type FbeastServer } from '../shared/config.js';
import { createSqliteStore } from '../shared/sqlite-store.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveClientConfigDir, detectMcpClient, parseMcpClient, type McpClient } from './mcp-client-paths.js';
import { writeHookScripts } from './hook-scripts.js';
import { codexServerName, ensureCodexProjectId } from './codex-server-names.js';
import { parseJsonObjectWithComments, writeJsonFileAtomic } from './settings-json.js';

const ALL_SERVERS: FbeastServer[] = [
  'memory', 'planner', 'critique', 'firewall', 'observer', 'governor', 'skills',
];

const SERVER_BIN_MAP: Record<FbeastServer, string> = {
  memory: 'fbeast-memory',
  planner: 'fbeast-planner',
  critique: 'fbeast-critique',
  firewall: 'fbeast-firewall',
  observer: 'fbeast-observer',
  governor: 'fbeast-governor',
  skills: 'fbeast-skills',
};

export interface InitOptions {
  root: string;
  claudeDir: string;
  hooks: boolean;
  servers?: FbeastServer[];
  client?: McpClient;
  mode?: 'standard' | 'proxy';
  /** Inject spawn for testing the codex path. */
  spawn?: (cmd: string, args: string[]) => { status: number | null; stderr?: Buffer | string; stdout?: Buffer | string };
}

export function runInit(options: InitOptions): void {
  const {
    root,
    claudeDir,
    hooks,
    servers = ALL_SERVERS,
    client = 'claude',
    mode = 'standard',
    spawn: spawnFn = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf-8' }),
  } = options;

  const config = FbeastConfig.init(root, servers);
  const store = createSqliteStore(config.dbPath);
  store.close();

  if (client === 'codex') {
    initCodex({ root, servers, hooks, config, spawnFn, mode });
    return;
  }

  initJsonClient({ root, claudeDir, hooks, servers, client, config, mode });
}

// ─── Claude / Gemini (settings.json-based clients) ───────────────────────────

function initJsonClient(options: {
  root: string;
  claudeDir: string;
  hooks: boolean;
  servers: FbeastServer[];
  client: 'claude' | 'gemini';
  config: FbeastConfig;
  mode: 'standard' | 'proxy';
}): void {
  const { root, claudeDir, hooks, servers, client, config, mode } = options;

  mkdirSync(claudeDir, { recursive: true });

  // Drop instructions file
  const instrSrc = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'instructions', 'fbeast-instructions.md');
  const instrDest = join(claudeDir, 'fbeast-instructions.md');
  if (existsSync(instrSrc)) {
    copyFileSync(instrSrc, instrDest);
  } else {
    writeFileSync(instrDest, INSTRUCTIONS_FALLBACK);
  }

  // Read existing settings
  const settingsPath = join(claudeDir, 'settings.json');
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = parseJsonObjectWithComments(readFileSync(settingsPath, 'utf-8'));
  }

  // Add MCP server entries. Claude project-scoped MCP registrations belong in
  // .mcp.json; Gemini uses .gemini/settings.json. Claude may launch project
  // MCP servers from outside the workspace, so anchor its relative database path
  // with CLAUDE_PROJECT_DIR instead of relying on the launcher cwd.
  const mcpConfigPath = client === 'claude' ? join(root, '.mcp.json') : settingsPath;
  let mcpConfig: Record<string, unknown> = client === 'claude' ? {} : settings;
  if (client === 'claude' && existsSync(mcpConfigPath)) {
    mcpConfig = parseJsonObjectWithComments(readFileSync(mcpConfigPath, 'utf-8'));
  }
  if (client === 'claude') {
    pruneFbeastMcpServerEntries(settings);
  }
  pruneFbeastMcpServerEntries(mcpConfig);
  const mcpServers = (mcpConfig['mcpServers'] as Record<string, unknown>) ?? {};
  const dbPath = client === 'claude' ? '${CLAUDE_PROJECT_DIR}/.fbeast/beast.db' : join('.fbeast', 'beast.db');
  const configPath = join('.fbeast', 'config.json');
  const proxyArgs = ['--db', dbPath, '--config', configPath];
  const standardServerArgs = (srv: FbeastServer) => srv === 'firewall'
    ? ['--db', dbPath, '--config', configPath]
    : ['--db', dbPath];
  if (mode === 'proxy') {
    mcpServers['fbeast-proxy'] = { command: 'fbeast-proxy', args: proxyArgs };
  } else {
    for (const srv of servers) {
      mcpServers[`fbeast-${srv}`] = { command: SERVER_BIN_MAP[srv], args: standardServerArgs(srv) };
    }
  }
  mcpConfig['mcpServers'] = mcpServers;

  // Hooks
  if (hooks) {
    if (client === 'claude') {
      settings['hooks'] = mergeClaudeHooks(settings['hooks'], root);
      config.hooks = true;
      config.save();
    } else {
      // Gemini: write shell scripts, reference project-relative paths in BeforeTool/AfterTool
      writeHookScripts(root, 'gemini');
      settings['hooks'] = mergeGeminiHooks(settings['hooks'], projectRootHookScripts('gemini'));
      config.hooks = true;
      config.save();
    }
  }

  if (client === 'claude') {
    writeJsonFileAtomic(mcpConfigPath, mcpConfig);
  }
  writeJsonFileAtomic(settingsPath, settings);

  printLine(`fbeast initialized in ${root}`);
  printLine(`  Config:     ${config.configPath}`);
  printLine(`  Database:   ${config.dbPath}`);
  printLine(`  MCP config: ${mcpConfigPath}`);
  printLine(`  Servers:    ${mode === 'proxy' ? 'fbeast-proxy (proxy mode)' : servers.join(', ')}`);
  if (hooks) printLine(`  Hooks:      enabled (${client})`);
}

// ─── Codex ────────────────────────────────────────────────────────────────────

function initCodex(options: {
  root: string;
  servers: FbeastServer[];
  hooks: boolean;
  config: FbeastConfig;
  spawnFn: (cmd: string, args: string[]) => { status: number | null; stderr?: Buffer | string; stdout?: Buffer | string };
  mode: 'standard' | 'proxy';
}): void {
  const { root, servers, hooks, config, spawnFn, mode } = options;
  ensureCodexProjectId(root);
  const dbPath = join(root, '.fbeast', 'beast.db');
  const configPath = join(root, '.fbeast', 'config.json');

  migrateLegacyCodexServers(root, spawnFn);
  writeCodexProjectConfig(root, servers, mode, dbPath, configPath);

  // Drop instructions into AGENTS.md
  writeAgentsMd(root);

  // Hooks: write shell scripts + codex hooks.json
  if (hooks) {
    const scripts = writeHookScripts(root, 'codex');
    writeCodexHooks(root, scripts);
    config.hooks = true;
    config.save();
  }

  printLine(`fbeast initialized in ${root}`);
  printLine(`  Config:   ${config.configPath}`);
  printLine(`  Database: ${config.dbPath}`);
  printLine(`  AGENTS.md: ${join(root, 'AGENTS.md')}`);
  printLine(`  MCP config: ${join(root, '.codex', 'config.toml')}`);
  printLine(`  Servers:  ${mode === 'proxy' ? `${codexServerName(root, 'proxy')} (proxy mode, project-scoped)` : `${servers.map((srv) => codexServerName(root, srv)).join(', ')} (project-scoped)`}`);
  if (hooks) printLine(`  Hooks:    enabled (codex hooks.json)`);
}

function migrateLegacyCodexServers(
  root: string,
  spawnFn: (cmd: string, args: string[]) => { status: number | null; stderr?: Buffer | string; stdout?: Buffer | string },
): void {
  const dbPath = join(root, '.fbeast', 'beast.db');
  const legacyNames = [...ALL_SERVERS.map((srv) => `fbeast-${srv}`), 'fbeast-proxy'];

  for (const name of legacyNames) {
    const getResult = spawnFn('codex', ['mcp', 'get', name]);
    if (getResult.status !== 0) continue;

    const output = `${getResult.stdout?.toString() ?? ''}\n${getResult.stderr?.toString() ?? ''}`;
    if (!output.includes(dbPath)) continue;

    const removeResult = spawnFn('codex', ['mcp', 'remove', name]);
    if (removeResult.status !== 0) {
      throw new Error(`fbeast init: failed to remove legacy Codex MCP server ${name}: ${removeResult.stderr?.toString().trim() ?? 'unknown error'}`);
    }
  }
}

function writeCodexProjectConfig(
  root: string,
  servers: readonly FbeastServer[],
  mode: 'standard' | 'proxy',
  dbPath: string,
  fbeastConfigPath: string,
): void {
  const codexDir = join(root, '.codex');
  mkdirSync(codexDir, { recursive: true });
  const configPath = join(codexDir, 'config.toml');
  const existing = existsSync(configPath) ? readFileSync(configPath, 'utf-8') : '';
  const cleaned = removeFbeastMcpServerTables(existing).trimEnd();
  const serverEntries = mode === 'proxy'
    ? [{ name: codexServerName(root, 'proxy'), command: 'fbeast-proxy', server: 'proxy' as const }]
    : servers.map((srv) => ({ name: codexServerName(root, srv), command: SERVER_BIN_MAP[srv], server: srv }));
  const fbeastConfig = serverEntries.map(({ name, command, server }) => {
    const args = mode === 'proxy'
      ? ['--db', dbPath, '--root', root, '--config', fbeastConfigPath]
      : server === 'firewall'
        ? ['--db', dbPath, '--config', fbeastConfigPath]
        : ['--db', dbPath];
    return [
      `[mcp_servers.${name}]`,
      `command = ${tomlString(command)}`,
      `args = [${args.map(tomlString).join(', ')}]`,
    ].join('\n');
  }).join('\n\n');
  const content = [cleaned, fbeastConfig].filter(Boolean).join('\n\n') + '\n';
  writeFileSync(configPath, content);
}

function removeFbeastMcpServerTables(toml: string): string {
  const lines = toml.split(/\r?\n/);
  const kept: string[] = [];
  let dropping = false;

  for (const line of lines) {
    const header = line.match(/^\s*\[\[?([^\]]+)]\]?\s*$/);
    if (header?.[1]) {
      dropping = isFbeastMcpServerSection(header[1]);
    }
    if (!dropping) kept.push(line);
  }

  return kept.join('\n').replace(/\n{3,}/g, '\n\n');
}

function isFbeastMcpServerSection(section: string): boolean {
  return /^mcp_servers\.(?:"fbeast-[^"]+"|fbeast-[A-Za-z0-9_-]+)(?:\.|$)/.test(section);
}

function tomlString(value: string): string {
  return JSON.stringify(value);
}

// ─── Hook config builders ─────────────────────────────────────────────────────

function projectRootHookCommand(scriptPath: string): string {
  const normalizedPath = scriptPath.split('\\').join('/');
  const executablePath = `./${normalizedPath}`;
  const lookup = [
    `p=\${CLAUDE_PROJECT_DIR:-\${GEMINI_PROJECT_ROOT:-}}`,
    `if [ -n "$p" ] && [ -x "$p/${normalizedPath}" ]; then cd "$p" && exec "${executablePath}"; fi`,
    'd=$PWD',
    'while [ "$d" != / ]; do '
      + `if [ -x "$d/${normalizedPath}" ]; then cd "$d" && exec "${executablePath}"; fi; `
      + 'd=$(dirname "$d")',
    'done',
    `echo "fbeast hook script not found: ${normalizedPath}" >&2`,
    'exit 127',
  ].join('; ');
  return `sh -c ${shellQuote(lookup)}`;
}

function projectRootHookScripts(client: 'claude' | 'gemini'): { preTool: string; postTool: string } {
  return client === 'claude'
    ? {
        preTool: projectRootHookCommand(join('.fbeast', 'hooks', 'fbeast-claude-pre-tool.sh')),
        postTool: projectRootHookCommand(join('.fbeast', 'hooks', 'fbeast-claude-post-tool.sh')),
      }
    : {
        preTool: projectRootHookCommand(join('.fbeast', 'hooks', 'gemini-before-tool.sh')),
        postTool: projectRootHookCommand(join('.fbeast', 'hooks', 'gemini-after-tool.sh')),
      };
}

/**
 * Claude Code: PreToolUse / PostToolUse with generated shell scripts that read JSON from stdin.
 */
function mergeClaudeHooks(
  existing: unknown,
  root: string,
): Record<string, unknown[]> {
  writeHookScripts(root, 'claude');
  const scripts = projectRootHookScripts('claude');
  const fbeastHooks: Record<string, unknown[]> = {
    PreToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: scripts.preTool }] }],
    PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: scripts.postTool }] }],
  };

  const hooks: Record<string, unknown[]> = {};
  if (isObjectRecord(existing)) {
    for (const [k, v] of Object.entries(existing)) {
      if (Array.isArray(v)) hooks[k] = [...v];
    }
  }
  for (const [hookType, newHooks] of Object.entries(fbeastHooks)) {
    const current = Array.isArray(hooks[hookType]) ? hooks[hookType] : [];
    hooks[hookType] = [...current.filter((h) => !isFbeastHook(h)), ...newHooks];
  }
  return hooks;
}

/**
 * Gemini CLI: BeforeTool / AfterTool with shell scripts that read JSON from stdin.
 */
function mergeGeminiHooks(
  existing: unknown,
  scripts: { preTool: string; postTool: string },
): Record<string, unknown> {
  const hooks: Record<string, unknown> = isObjectRecord(existing) ? { ...existing } : {};

  const beforeHook = { type: 'command', command: scripts.preTool };
  const afterHook = { type: 'command', command: scripts.postTool };

  // Merge BeforeTool — keep non-fbeast entries
  const existingBefore = Array.isArray(hooks['BeforeTool']) ? hooks['BeforeTool'] as unknown[] : [];
  const filteredBefore = existingBefore.filter((entry) => {
    if (isObjectRecord(entry) && Array.isArray(entry['hooks'])) {
      const innerHooks = entry['hooks'] as unknown[];
      return !innerHooks.some((h) => isObjectRecord(h) && typeof h['command'] === 'string' && h['command'].includes('fbeast'));
    }
    return true;
  });
  hooks['BeforeTool'] = [
    ...filteredBefore,
    { hooks: [beforeHook] },
  ];

  // Merge AfterTool
  const existingAfter = Array.isArray(hooks['AfterTool']) ? hooks['AfterTool'] as unknown[] : [];
  const filteredAfter = existingAfter.filter((entry) => {
    if (isObjectRecord(entry) && Array.isArray(entry['hooks'])) {
      const innerHooks = entry['hooks'] as unknown[];
      return !innerHooks.some((h) => isObjectRecord(h) && typeof h['command'] === 'string' && h['command'].includes('fbeast'));
    }
    return true;
  });
  hooks['AfterTool'] = [
    ...filteredAfter,
    { hooks: [afterHook] },
  ];

  return hooks;
}

/**
 * Codex: writes .codex/hooks.json with PreToolUse / PostToolUse entries.
 * Also enables codex_hooks feature in ~/.codex/config.toml via codex -c flag.
 */
function writeCodexHooks(root: string, scripts: { preTool: string; postTool: string }): void {
  // Project-level hooks.json (Codex picks this up from the project dir)
  const codexDir = join(root, '.codex');
  mkdirSync(codexDir, { recursive: true });
  const hooksPath = join(codexDir, 'hooks.json');

  let existing: Record<string, unknown> = {};
  if (existsSync(hooksPath)) {
    try { existing = JSON.parse(readFileSync(hooksPath, 'utf-8')); } catch { /* ignore */ }
  }

  const existingHooks = isObjectRecord(existing['hooks']) ? existing['hooks'] : {};

  // Filter out existing fbeast hooks, then add new ones
  const preToolUse = Array.isArray(existingHooks['PreToolUse'])
    ? (existingHooks['PreToolUse'] as unknown[]).filter((e) => !isFbeastCodexEntry(e))
    : [];
  const postToolUse = Array.isArray(existingHooks['PostToolUse'])
    ? (existingHooks['PostToolUse'] as unknown[]).filter((e) => !isFbeastCodexEntry(e))
    : [];

  existing['hooks'] = {
    ...existingHooks,
    PreToolUse: [
      ...preToolUse,
      { matcher: '*', hooks: [{ type: 'command', command: shellQuote(scripts.preTool) }] },
    ],
    PostToolUse: [
      ...postToolUse,
      { matcher: '*', hooks: [{ type: 'command', command: shellQuote(scripts.postTool) }] },
    ],
  };

  writeFileSync(hooksPath, JSON.stringify(existing, null, 2) + '\n');
}

const AGENTS_MD_START = '<!-- fbeast-start -->';
const AGENTS_MD_END = '<!-- fbeast-end -->';

/**
 * Writes (or merges) fbeast agent instructions into <root>/AGENTS.md.
 * Uses HTML comment markers so uninstall can strip the section cleanly.
 */
function writeAgentsMd(root: string): void {
  const agentsPath = join(root, 'AGENTS.md');
  const section = [
    AGENTS_MD_START,
    '# fbeast Agent Instructions',
    '',
    'When `fbeast_*` MCP tools are available in your current tool schema, use the loop below. If the tools are not available in your current tool schema, do not stop or record an exception just for that; follow the rest of the repository instructions with your platform\'s native file, git, shell, and GitHub tools.',
    '',
    '## On task start',
    '1. Use fbeast_memory_frontload to load project context',
    '2. Use fbeast_firewall_scan on user input before acting',
    '3. Use fbeast_plan_decompose for multi-step tasks',
    '',
    '## During execution',
    '- Use fbeast_governor_check before destructive/expensive operations',
    '- Use fbeast_observer_log for significant actions',
    '- Use fbeast_observer_log_cost after each significant LLM call (model name + token counts)',
    '',
    '## Before claiming done',
    '- Use fbeast_critique_evaluate on your output',
    '- If score < 0.7, revise and re-critique',
    '- Use fbeast_observer_trail to finalize audit',
    '',
    '## Memory',
    '- Use fbeast_memory_store for learnings worth preserving',
    '- Use fbeast_memory_query before making assumptions',
    AGENTS_MD_END,
  ].join('\n');

  if (existsSync(agentsPath)) {
    let content = readFileSync(agentsPath, 'utf-8');
    // Remove existing fbeast section if present
    const startIdx = content.indexOf(AGENTS_MD_START);
    const endIdx = content.indexOf(AGENTS_MD_END);
    if (startIdx !== -1 && endIdx !== -1) {
      content = content.slice(0, startIdx).trimEnd() + content.slice(endIdx + AGENTS_MD_END.length);
    }
    writeFileSync(agentsPath, content.trimEnd() + '\n\n' + section + '\n');
  } else {
    writeFileSync(agentsPath, section + '\n');
  }
}

function isFbeastCodexEntry(entry: unknown): boolean {
  if (!isObjectRecord(entry)) return false;
  const hooks = entry['hooks'];
  if (!Array.isArray(hooks)) return false;
  return hooks.some(
    (h) => isObjectRecord(h) && typeof h['command'] === 'string' && h['command'].includes('fbeast'),
  );
}

// ─── Entry point ──────────────────────────────────────────────────────────────

const isMain = (await import('../shared/is-main.js')).isMain(import.meta.url);
if (isMain) {
  const root = process.cwd();
  const { resolveInitOptions } = await import('./init-options.js');
  const clientArg = parseMcpClient(process.argv.find((a) => a.startsWith('--client='))?.split('=')[1]);
  const client = clientArg ?? detectMcpClient({ cwd: root, homeDir: homedir(), exists: existsSync });
  const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
  const initOptions = await resolveInitOptions(process.argv);
  runInit({ root, claudeDir, client, ...initOptions });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFbeastHook(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  const inner = value['hooks'];
  if (!Array.isArray(inner)) return false;
  return inner.some(
    (h) => isObjectRecord(h) && typeof h['command'] === 'string' && h['command'].includes('fbeast'),
  );
}

function pruneFbeastMcpServerEntries(config: Record<string, unknown>): void {
  const mcpServers = config['mcpServers'];
  if (!isObjectRecord(mcpServers)) return;
  for (const key of Object.keys(mcpServers)) {
    if (key.startsWith('fbeast-')) delete mcpServers[key];
  }
  config['mcpServers'] = mcpServers;
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Re-export for test access
export { isObjectRecord };

const INSTRUCTIONS_FALLBACK = [
  '# fbeast Agent Framework',
  '',
  'When `fbeast_*` MCP tools are available in your current tool schema, use the loop below. If the tools are not available in your current tool schema, do not stop or record an exception just for that; follow the rest of the repository instructions with your platform\'s native file, git, shell, and GitHub tools.',
  '',
  '## On task start',
  '1. Use fbeast_memory_frontload to load project context',
  '2. Use fbeast_firewall_scan on user input before acting',
  '3. Use fbeast_plan_decompose for multi-step tasks',
  '',
  '## During execution',
  '- Use fbeast_observer_log for significant actions',
  '- Use fbeast_governor_check before destructive/expensive operations',
  '- Use fbeast_observer_log_cost after each significant LLM call to record token usage and spend; use fbeast_observer_cost only when you need a summary',
  '',
  '## Before claiming done',
  '- Use fbeast_critique_evaluate on your output',
  '- If score < 0.7, revise and re-critique',
  '- Use fbeast_observer_trail to finalize audit',
  '',
  '## Memory',
  '- Use fbeast_memory_store for learnings worth preserving',
  '- Use fbeast_memory_query before making assumptions',
  '',
].join('\n');
