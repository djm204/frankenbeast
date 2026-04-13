#!/usr/bin/env node
import { FbeastConfig, type FbeastServer } from '../shared/config.js';
import { createSqliteStore } from '../shared/sqlite-store.js';
import { existsSync, mkdirSync, readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveClaudeConfigDir } from './claude-config-paths.js';

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

const FBEAST_HOOKS = {
  preToolCall: [
    {
      command: 'fbeast-hook pre-tool $TOOL_NAME',
      description: 'fbeast governance check',
    },
  ],
  postToolCall: [
    {
      command: 'fbeast-hook post-tool $TOOL_NAME $RESULT',
      description: 'fbeast observer logging',
    },
  ],
} as const;

export interface InitOptions {
  root: string;
  claudeDir: string;
  hooks: boolean;
  servers?: FbeastServer[];
}

export function runInit(options: InitOptions): void {
  const { root, claudeDir, hooks, servers = ALL_SERVERS } = options;

  const config = FbeastConfig.init(root, servers);

  const store = createSqliteStore(config.dbPath);
  store.close();

  mkdirSync(claudeDir, { recursive: true });

  const instrSrc = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'instructions', 'fbeast-instructions.md');
  const instrDest = join(claudeDir, 'fbeast-instructions.md');

  if (existsSync(instrSrc)) {
    copyFileSync(instrSrc, instrDest);
  } else {
    writeFileSync(instrDest, [
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
      '- Call fbeast_observer_cost periodically to track spend',
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
    ].join('\n'));
  }

  const settingsPath = join(claudeDir, 'settings.json');
  let settings: Record<string, unknown> = {};
  if (existsSync(settingsPath)) {
    settings = JSON.parse(readFileSync(settingsPath, 'utf-8'));
  }

  const mcpServers = (settings['mcpServers'] as Record<string, unknown>) ?? {};
  for (const srv of servers) {
    const binName = SERVER_BIN_MAP[srv];
    mcpServers[`fbeast-${srv}`] = {
      command: binName,
      args: ['--db', join(root, '.fbeast', 'beast.db')],
    };
  }
  settings['mcpServers'] = mcpServers;

  if (hooks) {
    settings['hooks'] = mergeHooks(settings['hooks']);
    config.hooks = true;
    config.save();
  }

  writeFileSync(settingsPath, JSON.stringify(settings, null, 2) + '\n');

  console.log(`fbeast initialized in ${root}`);
  console.log(`  Config: ${config.configPath}`);
  console.log(`  Database: ${config.dbPath}`);
  console.log(`  Instructions: ${instrDest}`);
  console.log(`  MCP config: ${settingsPath}`);
  console.log(`  Servers: ${servers.join(', ')}`);
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].replace(/\\/g, '/'));
if (isMain) {
  const root = process.cwd();
  const claudeDir = resolveClaudeConfigDir({
    cwd: root,
    homeDir: homedir(),
    exists: existsSync,
  });
  const hooks = process.argv.includes('--hooks');
  runInit({ root, claudeDir, hooks });
}

function mergeHooks(existing: unknown): Record<string, unknown[]> {
  const hooks: Record<string, unknown[]> = {};

  if (isObjectRecord(existing)) {
    for (const [hookType, hookList] of Object.entries(existing)) {
      if (Array.isArray(hookList)) {
        hooks[hookType] = [...hookList];
      }
    }
  }

  for (const [hookType, newHooks] of Object.entries(FBEAST_HOOKS)) {
    const currentHooks = Array.isArray(hooks[hookType]) ? hooks[hookType] : [];
    const preservedHooks = currentHooks.filter((hook) => !isFbeastHook(hook));
    hooks[hookType] = [...preservedHooks, ...newHooks];
  }

  return hooks;
}

function isFbeastHook(value: unknown): boolean {
  if (!isObjectRecord(value)) {
    return false;
  }

  const command = typeof value.command === 'string' ? value.command : '';
  const description = typeof value.description === 'string' ? value.description : '';
  return command.includes('fbeast') || description.includes('fbeast');
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}
