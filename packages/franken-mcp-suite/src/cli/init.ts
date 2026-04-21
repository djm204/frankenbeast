#!/usr/bin/env node
import { FbeastConfig, type FbeastServer } from '../shared/config.js';
import { createSqliteStore } from '../shared/sqlite-store.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { resolveClientConfigDir, detectMcpClient, type McpClient } from './mcp-client-paths.js';
import { writeHookScripts } from './hook-scripts.js';

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
  /** Inject spawn for testing the codex path. */
  spawn?: (cmd: string, args: string[]) => { status: number | null; stderr?: Buffer | string };
}

export function runInit(options: InitOptions): void {
  const {
    root,
    claudeDir,
    hooks,
    servers = ALL_SERVERS,
    client = 'claude',
    spawn: spawnFn = (cmd, args) => spawnSync(cmd, args, { encoding: 'utf-8' }),
  } = options;

  const config = FbeastConfig.init(root, servers);
  const store = createSqliteStore(config.dbPath);
  store.close();

  if (client === 'codex') {
    initCodex({ root, servers, hooks, config, spawnFn });
    return;
  }

  initJsonClient({ root, claudeDir, hooks, servers, client, config });
}

// ─── Claude / Gemini (settings.json-based clients) ───────────────────────────

function initJsonClient(options: {
  root: string;
  claudeDir: string;
  hooks: boolean;
  servers: FbeastServer[];
  client: 'claude' | 'gemini';
  config: FbeastConfig;
}): void {
  const { root, claudeDir, hooks, servers, client, config } = options;

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
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }

  // Add MCP server entries
  const mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};
  const dbPath = join(root, '.fbeast', 'beast.db');
  for (const srv of servers) {
    mcpServers[`fbeast-${srv}`] = { command: SERVER_BIN_MAP[srv], args: ['--db', dbPath] };
  }
  settings['mcpServers'] = mcpServers;

  // Hooks
  if (hooks) {
    if (client === 'claude') {
      settings['hooks'] = mergeClaudeHooks(settings['hooks'], root);
      config.hooks = true;
      config.save();
    } else {
      // Gemini: write shell scripts, reference them in BeforeTool/AfterTool
      const scripts = writeHookScripts(root, 'gemini');
      settings['hooks'] = mergeGeminiHooks(settings['hooks'], scripts);
      config.hooks = true;
      config.save();
    }
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  console.log(`fbeast initialized in ${root}`);
  console.log(`  Config:     ${config.configPath}`);
  console.log(`  Database:   ${config.dbPath}`);
  console.log(`  MCP config: ${settingsPath}`);
  console.log(`  Servers:    ${servers.join(', ')}`);
  if (hooks) console.log(`  Hooks:      enabled (${client})`);
}

// ─── Codex ────────────────────────────────────────────────────────────────────

function initCodex(options: {
  root: string;
  servers: FbeastServer[];
  hooks: boolean;
  config: FbeastConfig;
  spawnFn: (cmd: string, args: string[]) => { status: number | null; stderr?: Buffer | string };
}): void {
  const { root, servers, hooks, config, spawnFn } = options;
  const dbPath = join(root, '.fbeast', 'beast.db');

  // Register MCP servers via codex mcp add
  const failed: string[] = [];
  for (const srv of servers) {
    const name = `fbeast-${srv}`;
    const result = spawnFn('codex', ['mcp', 'add', name, '--', SERVER_BIN_MAP[srv], '--db', dbPath]);
    if (result.status !== 0) {
      failed.push(name);
      console.error(`  ✗ Failed to register ${name}: ${result.stderr?.toString().trim() ?? 'unknown error'}`);
    }
  }

  if (failed.length > 0) {
    throw new Error(`fbeast init: failed to register ${failed.length} server(s) with codex: ${failed.join(', ')}`);
  }

  // Drop instructions into AGENTS.md
  writeAgentsMd(root);

  // Hooks: write shell scripts + codex hooks.json
  if (hooks) {
    const scripts = writeHookScripts(root, 'codex');
    writeCodexHooks(root, scripts);
    config.hooks = true;
    config.save();
  }

  console.log(`fbeast initialized in ${root}`);
  console.log(`  Config:   ${config.configPath}`);
  console.log(`  Database: ${config.dbPath}`);
  console.log(`  AGENTS.md: ${join(root, 'AGENTS.md')}`);
  console.log(`  Servers:  ${servers.join(', ')} (registered via codex mcp add)`);
  if (hooks) console.log(`  Hooks:    enabled (codex hooks.json)`);
}

// ─── Hook config builders ─────────────────────────────────────────────────────

/**
 * Claude Code: preToolCall / postToolCall command strings with $TOOL_NAME.
 */
function mergeClaudeHooks(
  existing: unknown,
  root: string,
): Record<string, unknown[]> {
  const dbPath = join(root, '.fbeast', 'beast.db');
  const fbeastHooks = {
    preToolCall: [
      { command: `fbeast-hook pre-tool --db "${dbPath}" $TOOL_NAME`, description: 'fbeast governance check' },
    ],
    postToolCall: [
      { command: `fbeast-hook post-tool --db "${dbPath}" $TOOL_NAME $RESULT`, description: 'fbeast observer logging' },
    ],
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
      { matcher: '*', hooks: [{ type: 'command', command: scripts.preTool }] },
    ],
    PostToolUse: [
      ...postToolUse,
      { matcher: '*', hooks: [{ type: 'command', command: scripts.postTool }] },
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
    'You have access to fbeast MCP tools. Follow this loop on every task:',
    '',
    '## On task start',
    '1. Call fbeast_memory_frontload to load project context',
    '2. Call fbeast_firewall_scan on user input before acting',
    '3. Call fbeast_plan_decompose for multi-step tasks',
    '',
    '## During execution',
    '- Call fbeast_governor_check before destructive/expensive operations',
    '- Call fbeast_observer_log for significant actions',
    '- Call fbeast_observer_log_cost after each significant LLM call (model name + token counts)',
    '',
    '## Before claiming done',
    '- Call fbeast_critique_evaluate on your output',
    '- If score < 0.7, revise and re-critique',
    '- Call fbeast_observer_trail to finalize audit',
    '',
    '## Memory',
    '- fbeast_memory_store for learnings worth preserving',
    '- fbeast_memory_query before making assumptions',
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
  const clientArg = process.argv.find((a) => a.startsWith('--client='))?.split('=')[1] as McpClient | undefined;
  const client = clientArg ?? detectMcpClient({ cwd: root, homeDir: homedir(), exists: existsSync });
  const claudeDir = resolveClientConfigDir({ client, cwd: root, homeDir: homedir(), exists: existsSync });
  const initOptions = await resolveInitOptions(process.argv);
  runInit({ root, claudeDir, client, ...initOptions });
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isFbeastHook(value: unknown): boolean {
  if (!isObjectRecord(value)) return false;
  const command = typeof value['command'] === 'string' ? value['command'] : '';
  const description = typeof value['description'] === 'string' ? value['description'] : '';
  return command.includes('fbeast') || description.includes('fbeast');
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

// Re-export for test access
export { isObjectRecord };

const INSTRUCTIONS_FALLBACK = [
  '# fbeast Agent Framework',
  '',
  'You have access to fbeast MCP tools. Use them as follows:',
  '',
  '## On task start',
  '1. Call fbeast_memory_frontload to load project context',
  '2. Call fbeast_firewall_scan on user input before acting',
  '3. Call fbeast_plan_decompose for multi-step tasks',
  '',
  '## During execution',
  '- Call fbeast_observer_log for significant actions',
  '- Call fbeast_governor_check before destructive/expensive operations',
  '- Call fbeast_observer_log_cost after each significant LLM call (model name + token counts)',
  '',
  '## Before claiming done',
  '- Call fbeast_critique_evaluate on your output',
  '- If score < 0.7, revise and re-critique',
  '- Call fbeast_observer_trail to finalize audit',
  '',
  '## Memory',
  '- fbeast_memory_store for learnings worth preserving',
  '- fbeast_memory_query before making assumptions',
  '',
].join('\n');
